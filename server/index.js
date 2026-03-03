const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io')) return next();
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory game store
const games = {};

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function assignRoles(players) {
  const count = players.length;
  const mafiaCount = Math.max(1, Math.round(count * 0.25));
  const medicCount = count >= 20 ? 2 : 1;
  const sheriffCount = count >= 24 ? 2 : 1;

  const roles = [];
  for (let i = 0; i < mafiaCount; i++) roles.push('Mafia');
  for (let i = 0; i < medicCount; i++) roles.push('Medic');
  for (let i = 0; i < sheriffCount; i++) roles.push('Sheriff');
  while (roles.length < count) roles.push('Town');

  // Shuffle roles
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  const assignments = {};
  players.forEach((player, idx) => {
    assignments[player.id] = roles[idx];
  });
  return assignments;
}

function checkWinCondition(game) {
  const alivePlayers = game.players.filter(p => p.alive);
  const mafiaAlive = alivePlayers.filter(p => game.roles[p.id] === 'Mafia').length;
  const townAlive = alivePlayers.filter(p => game.roles[p.id] !== 'Mafia').length;

  if (mafiaAlive === 0) return 'town';
  if (mafiaAlive >= townAlive) return 'mafia';
  return null;
}

io.on('connection', (socket) => {
  console.log('Connected:', socket.id);

  // Narrator creates a game
  socket.on('create-game', (callback) => {
    let code = generateCode();
    while (games[code]) code = generateCode();

    games[code] = {
      code,
      narratorId: socket.id,
      players: [],
      roles: {},
      phase: 'lobby',
      round: 0,
      mafiaVotes: {},
      mafiaKillTarget: null,
      sheriffChecks: {},
      medicPicks: {},
      medicSaveTarget: null,
      wasSaved: false,
      nominations: {},
      trialPlayers: [],
      trialVotes: {},
      killedThisNight: null,
      killedThisDay: null,
      nightLog: [],
    };

    socket.join(code);
    socket.gameCode = code;
    socket.isNarrator = true;
    callback({ success: true, code });
    console.log(`Game created: ${code}`);
  });

  // Player joins a game
  socket.on('join-game', ({ code, name }, callback) => {
    const game = games[code];
    if (!game) {
      return callback({ success: false, error: 'Game not found' });
    }
    if (game.phase !== 'lobby') {
      return callback({ success: false, error: 'Game already in progress' });
    }
    if (game.players.find(p => p.name === name)) {
      return callback({ success: false, error: 'Name already taken' });
    }

    const player = { id: socket.id, name, alive: true };
    game.players.push(player);
    socket.join(code);
    socket.gameCode = code;
    socket.playerName = name;

    // Notify narrator
    io.to(game.narratorId).emit('player-joined', {
      players: game.players.map(p => ({ name: p.name, id: p.id }))
    });

    callback({ success: true, player });
    console.log(`${name} joined game ${code}`);
  });

  // Narrator assigns roles
  socket.on('assign-roles', (callback) => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;
    if (game.players.length < 4) {
      return callback({ success: false, error: 'Need at least 4 players' });
    }

    game.roles = assignRoles(game.players);
    game.phase = 'roles-assigned';

    // Send each player their role
    game.players.forEach(player => {
      io.to(player.id).emit('role-assigned', {
        role: game.roles[player.id]
      });
    });

    // Send narrator all roles
    const roleList = game.players.map(p => ({
      name: p.name,
      role: game.roles[p.id],
      id: p.id
    }));
    callback({ success: true, roles: roleList });
    console.log(`Roles assigned for game ${game.code}`);
  });

  // Narrator: Town Go To Sleep
  socket.on('town-sleep', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'night';
    game.round++;
    game.mafiaVotes = {};
    game.mafiaKillTarget = null;
    game.sheriffChecks = {};
    game.medicPicks = {};
    game.medicSaveTarget = null;
    game.wasSaved = false;
    game.killedThisNight = null;

    // Tell all players it's night
    game.players.forEach(player => {
      if (player.alive) {
        io.to(player.id).emit('phase-change', { phase: 'sleep' });
      }
    });
  });

  // Narrator: Mafia Wake Up
  socket.on('mafia-wake', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'mafia-voting';
    const alivePlayers = game.players
      .filter(p => p.alive)
      .map(p => ({ name: p.name, id: p.id }));

    // Wake up mafia members
    game.players.forEach(player => {
      if (player.alive && game.roles[player.id] === 'Mafia') {
        io.to(player.id).emit('phase-change', {
          phase: 'mafia-vote',
          players: alivePlayers.filter(p => p.id !== player.id)
        });
      }
    });
  });

  // Mafia member votes to kill
  socket.on('mafia-vote', ({ targetId }) => {
    const game = games[socket.gameCode];
    if (!game || game.phase !== 'mafia-voting') return;
    if (game.roles[socket.id] !== 'Mafia') return;

    game.mafiaVotes[socket.id] = targetId;

    // Count votes
    const voteCounts = {};
    Object.values(game.mafiaVotes).forEach(tid => {
      voteCounts[tid] = (voteCounts[tid] || 0) + 1;
    });

    // Check if all alive mafia have voted
    const aliveMafia = game.players.filter(p => p.alive && game.roles[p.id] === 'Mafia');
    const allVoted = aliveMafia.every(p => game.mafiaVotes[p.id]);

    // Notify narrator of current votes
    const voteDetails = Object.entries(game.mafiaVotes).map(([voterId, targetId]) => ({
      voter: game.players.find(p => p.id === voterId)?.name,
      target: game.players.find(p => p.id === targetId)?.name,
      targetId
    }));

    io.to(game.narratorId).emit('mafia-votes-update', {
      votes: voteDetails,
      allVoted,
      voteCounts: Object.entries(voteCounts).map(([tid, count]) => ({
        name: game.players.find(p => p.id === tid)?.name,
        targetId: tid,
        count
      }))
    });

    // Notify mafia members of current votes
    aliveMafia.forEach(p => {
      io.to(p.id).emit('mafia-votes-status', {
        votes: voteDetails,
        allVoted
      });
    });
  });

  // Narrator confirms mafia kill
  socket.on('confirm-kill', ({ targetId }) => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.mafiaKillTarget = targetId;
    game.killedThisNight = targetId;
    const targetName = game.players.find(p => p.id === targetId)?.name;
    console.log(`Mafia kill confirmed: ${targetName}`);
  });

  // Narrator: Mafia Go To Sleep
  socket.on('mafia-sleep', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'mafia-asleep';
    game.players.forEach(player => {
      if (player.alive && game.roles[player.id] === 'Mafia') {
        io.to(player.id).emit('phase-change', { phase: 'sleep' });
      }
    });
  });

  // Narrator: Sheriff Wake Up
  socket.on('sheriff-wake', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'sheriff-investigating';
    game.sheriffChecks = {};
    const alivePlayers = game.players
      .filter(p => p.alive)
      .map(p => ({ name: p.name, id: p.id }));

    // Wake up sheriff(s)
    game.players.forEach(player => {
      if (player.alive && game.roles[player.id] === 'Sheriff') {
        io.to(player.id).emit('phase-change', {
          phase: 'sheriff-investigate',
          players: alivePlayers.filter(p => p.id !== player.id)
        });
      }
    });
  });

  // Sheriff investigates a player
  socket.on('sheriff-check', ({ targetId }) => {
    const game = games[socket.gameCode];
    if (!game || game.phase !== 'sheriff-investigating') return;
    if (game.roles[socket.id] !== 'Sheriff') return;

    game.sheriffChecks[socket.id] = targetId;

    const aliveSheriffs = game.players.filter(p => p.alive && game.roles[p.id] === 'Sheriff');

    if (aliveSheriffs.length >= 2) {
      // Check if both sheriffs agree
      const allChecked = aliveSheriffs.every(p => game.sheriffChecks[p.id]);
      if (allChecked) {
        const targets = Object.values(game.sheriffChecks);
        const allAgree = targets.every(t => t === targets[0]);
        if (allAgree) {
          // Reveal result to all sheriffs
          const targetRole = game.roles[targetId];
          const isMafia = targetRole === 'Mafia';
          aliveSheriffs.forEach(s => {
            io.to(s.id).emit('sheriff-result', { isMafia, targetName: game.players.find(p => p.id === targetId)?.name });
          });
          io.to(game.narratorId).emit('sheriff-done', {
            targetName: game.players.find(p => p.id === targetId)?.name,
            isMafia
          });
        } else {
          // Disagree - ask them to re-vote
          aliveSheriffs.forEach(s => {
            game.sheriffChecks = {};
            io.to(s.id).emit('sheriff-disagree');
          });
        }
      } else {
        // Waiting for other sheriff
        io.to(socket.id).emit('sheriff-waiting');
      }
    } else {
      // Single sheriff - immediate result
      const targetRole = game.roles[targetId];
      const isMafia = targetRole === 'Mafia';
      io.to(socket.id).emit('sheriff-result', { isMafia, targetName: game.players.find(p => p.id === targetId)?.name });
      io.to(game.narratorId).emit('sheriff-done', {
        targetName: game.players.find(p => p.id === targetId)?.name,
        isMafia
      });
    }
  });

  // Narrator: Sheriff Go To Sleep
  socket.on('sheriff-sleep', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'sheriff-asleep';
    game.players.forEach(player => {
      if (player.alive && game.roles[player.id] === 'Sheriff') {
        io.to(player.id).emit('phase-change', { phase: 'sleep' });
      }
    });
  });

  // Narrator: Medic Wake Up
  socket.on('medic-wake', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'medic-saving';
    game.medicPicks = {};
    const alivePlayers = game.players
      .filter(p => p.alive)
      .map(p => ({ name: p.name, id: p.id }));

    // Wake up medic(s)
    game.players.forEach(player => {
      if (player.alive && game.roles[player.id] === 'Medic') {
        io.to(player.id).emit('phase-change', {
          phase: 'medic-save',
          players: alivePlayers
        });
      }
    });
  });

  // Medic picks a player to save
  socket.on('medic-save', ({ targetId }) => {
    const game = games[socket.gameCode];
    if (!game || game.phase !== 'medic-saving') return;
    if (game.roles[socket.id] !== 'Medic') return;

    game.medicPicks[socket.id] = targetId;

    const aliveMedics = game.players.filter(p => p.alive && game.roles[p.id] === 'Medic');

    if (aliveMedics.length >= 2) {
      const allPicked = aliveMedics.every(p => game.medicPicks[p.id]);
      if (allPicked) {
        const targets = Object.values(game.medicPicks);
        const allAgree = targets.every(t => t === targets[0]);
        if (allAgree) {
          game.medicSaveTarget = targetId;
          const saved = game.mafiaKillTarget === targetId;
          game.wasSaved = saved;
          aliveMedics.forEach(m => {
            io.to(m.id).emit('medic-result', { saved });
          });
          io.to(game.narratorId).emit('medic-done', {
            targetName: game.players.find(p => p.id === targetId)?.name,
            saved
          });
        } else {
          aliveMedics.forEach(m => {
            game.medicPicks = {};
            io.to(m.id).emit('medic-disagree');
          });
        }
      } else {
        io.to(socket.id).emit('medic-waiting');
      }
    } else {
      game.medicSaveTarget = targetId;
      const saved = game.mafiaKillTarget === targetId;
      game.wasSaved = saved;
      io.to(socket.id).emit('medic-result', { saved });
      io.to(game.narratorId).emit('medic-done', {
        targetName: game.players.find(p => p.id === targetId)?.name,
        saved
      });
    }
  });

  // Narrator: Medic Go To Sleep
  socket.on('medic-sleep', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'medic-asleep';
    game.players.forEach(player => {
      if (player.alive && game.roles[player.id] === 'Medic') {
        io.to(player.id).emit('phase-change', { phase: 'sleep' });
      }
    });
  });

  // Narrator: Town Wake Up
  socket.on('town-wake', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'day-reveal';
    game.nominations = {};

    let killedName = null;
    if (game.mafiaKillTarget) {
      const target = game.players.find(p => p.id === game.mafiaKillTarget);
      if (target) {
        if (game.wasSaved) {
          killedName = null;
        } else {
          target.alive = false;
          killedName = target.name;
          game.killedThisNight = game.mafiaKillTarget;
        }
      }
    }

    // Check win condition
    const winner = checkWinCondition(game);
    if (winner) {
      game.phase = 'game-over';
      const roleList = game.players.map(p => ({
        name: p.name,
        role: game.roles[p.id],
        alive: p.alive
      }));
      io.to(game.code).emit('game-over', {
        winner,
        roles: roleList,
        killedName,
        wasSaved: game.wasSaved
      });
      return;
    }

    // Announce to all players
    game.players.forEach(player => {
      io.to(player.id).emit('town-wake-up', {
        killedName,
        wasSaved: game.wasSaved,
        alivePlayers: game.players.filter(p => p.alive).map(p => ({ name: p.name, id: p.id }))
      });
    });

    io.to(game.narratorId).emit('town-wake-up', {
      killedName,
      wasSaved: game.wasSaved,
      alivePlayers: game.players.filter(p => p.alive).map(p => ({ name: p.name, id: p.id }))
    });
  });

  // Narrator starts nomination phase
  socket.on('start-nominations', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'nominations';
    game.nominations = {};

    const alivePlayers = game.players
      .filter(p => p.alive)
      .map(p => ({ name: p.name, id: p.id }));

    game.players.forEach(player => {
      if (player.alive) {
        io.to(player.id).emit('phase-change', {
          phase: 'nominate',
          players: alivePlayers.filter(p => p.id !== player.id)
        });
      }
    });
  });

  // Player nominates someone
  socket.on('nominate', ({ targetId }) => {
    const game = games[socket.gameCode];
    if (!game || game.phase !== 'nominations') return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    game.nominations[socket.id] = targetId;

    // Count nominations
    const nomCounts = {};
    Object.values(game.nominations).forEach(tid => {
      nomCounts[tid] = (nomCounts[tid] || 0) + 1;
    });

    const nomDetails = Object.entries(nomCounts)
      .map(([tid, count]) => ({
        name: game.players.find(p => p.id === tid)?.name,
        targetId: tid,
        count
      }))
      .sort((a, b) => b.count - a.count);

    const aliveCount = game.players.filter(p => p.alive).length;
    const allNominated = Object.keys(game.nominations).length === aliveCount;

    io.to(game.narratorId).emit('nominations-update', {
      nominations: nomDetails,
      allNominated
    });
  });

  // Narrator starts trials
  socket.on('start-trials', ({ trialPlayerIds }) => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'trials';
    game.trialPlayers = trialPlayerIds.slice(0, 4);
    game.trialVotes = {};

    const trialNames = game.trialPlayers.map(id => ({
      name: game.players.find(p => p.id === id)?.name,
      id
    }));

    game.players.forEach(player => {
      if (player.alive) {
        io.to(player.id).emit('phase-change', {
          phase: 'trials',
          trialPlayers: trialNames
        });
      }
    });

    io.to(game.narratorId).emit('phase-change', {
      phase: 'trials',
      trialPlayers: trialNames
    });
  });

  // Narrator starts voting
  socket.on('start-voting', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;

    game.phase = 'voting';
    game.trialVotes = {};

    const trialNames = game.trialPlayers.map(id => ({
      name: game.players.find(p => p.id === id)?.name,
      id
    }));

    game.players.forEach(player => {
      if (player.alive) {
        io.to(player.id).emit('phase-change', {
          phase: 'voting',
          trialPlayers: trialNames
        });
      }
    });
  });

  // Player votes in trial
  socket.on('trial-vote', ({ targetId }) => {
    const game = games[socket.gameCode];
    if (!game || game.phase !== 'voting') return;

    const player = game.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    game.trialVotes[socket.id] = targetId;

    // Build vote display (visible to everyone)
    const voteDisplay = Object.entries(game.trialVotes).map(([voterId, tid]) => ({
      voter: game.players.find(p => p.id === voterId)?.name,
      target: game.players.find(p => p.id === tid)?.name,
      targetId: tid
    }));

    const aliveCount = game.players.filter(p => p.alive).length;
    const allVoted = Object.keys(game.trialVotes).length === aliveCount;

    // Broadcast votes to everyone
    io.to(game.code).emit('trial-votes-update', {
      votes: voteDisplay,
      allVoted
    });

    if (allVoted) {
      // Count votes
      const voteCounts = {};
      Object.values(game.trialVotes).forEach(tid => {
        voteCounts[tid] = (voteCounts[tid] || 0) + 1;
      });

      // Find player with most votes
      let maxVotes = 0;
      let killedId = null;
      Object.entries(voteCounts).forEach(([tid, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          killedId = tid;
        }
      });

      if (killedId) {
        const killedPlayer = game.players.find(p => p.id === killedId);
        if (killedPlayer) {
          killedPlayer.alive = false;
          const killedRole = game.roles[killedId];

          // Check win condition
          const winner = checkWinCondition(game);

          if (winner) {
            game.phase = 'game-over';
            const roleList = game.players.map(p => ({
              name: p.name,
              role: game.roles[p.id],
              alive: p.alive
            }));
            io.to(game.code).emit('game-over', {
              winner,
              roles: roleList,
              killedName: killedPlayer.name,
              killedRole
            });
          } else {
            game.phase = 'day-voted';
            io.to(game.code).emit('trial-result', {
              killedName: killedPlayer.name,
              killedRole: killedRole === 'Mafia' ? 'A Member of The Mafia' : 'A Member of The Town'
            });
          }
        }
      }
    }
  });

  // Narrator starts new night (after day voting)
  socket.on('next-round', () => {
    const game = games[socket.gameCode];
    if (!game || game.narratorId !== socket.id) return;
    // Reset for narrator to control night again
    game.phase = 'night-ready';
    io.to(game.narratorId).emit('phase-change', { phase: 'night-ready' });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
    const code = socket.gameCode;
    if (!code || !games[code]) return;

    const game = games[code];
    if (game.narratorId === socket.id) {
      // Narrator left - end game
      io.to(code).emit('game-ended', { reason: 'Narrator disconnected' });
      delete games[code];
      return;
    }

    // Player disconnected during active game
    const player = game.players.find(p => p.id === socket.id);
    if (!player) return;

    if (game.phase === 'lobby') {
      // Remove from lobby
      game.players = game.players.filter(p => p.id !== socket.id);
      io.to(game.narratorId).emit('player-joined', {
        players: game.players.map(p => ({ name: p.name, id: p.id }))
      });
      return;
    }

    // Mark player as dead if game is in progress
    if (player.alive) {
      player.alive = false;
      io.to(game.narratorId).emit('player-disconnected', {
        name: player.name,
        role: game.roles[player.id]
      });

      // Check if this disconnect causes a win condition
      const winner = checkWinCondition(game);
      if (winner) {
        game.phase = 'game-over';
        const roleList = game.players.map(p => ({
          name: p.name,
          role: game.roles[p.id],
          alive: p.alive
        }));
        io.to(game.code).emit('game-over', {
          winner,
          roles: roleList,
          killedName: player.name + ' (disconnected)',
          killedRole: game.roles[player.id]
        });
        return;
      }

      // If the disconnected player was expected to vote, check if we can proceed
      // Mafia vote phase
      if (game.phase === 'mafia-voting' && game.roles[socket.id] === 'Mafia') {
        const aliveMafia = game.players.filter(p => p.alive && game.roles[p.id] === 'Mafia');
        const allVoted = aliveMafia.every(p => game.mafiaVotes[p.id]);
        if (allVoted && aliveMafia.length > 0) {
          const voteCounts = {};
          Object.values(game.mafiaVotes).forEach(tid => {
            voteCounts[tid] = (voteCounts[tid] || 0) + 1;
          });
          const voteDetails = Object.entries(game.mafiaVotes).map(([voterId, targetId]) => ({
            voter: game.players.find(p => p.id === voterId)?.name,
            target: game.players.find(p => p.id === targetId)?.name,
            targetId
          }));
          io.to(game.narratorId).emit('mafia-votes-update', {
            votes: voteDetails,
            allVoted: true,
            voteCounts: Object.entries(voteCounts).map(([tid, count]) => ({
              name: game.players.find(p => p.id === tid)?.name,
              targetId: tid,
              count
            }))
          });
        }
      }

      // Sheriff phase - if disconnected sheriff, notify narrator
      if (game.phase === 'sheriff-investigating' && game.roles[socket.id] === 'Sheriff') {
        const aliveSheriffs = game.players.filter(p => p.alive && game.roles[p.id] === 'Sheriff');
        if (aliveSheriffs.length === 0) {
          io.to(game.narratorId).emit('sheriff-done', {
            targetName: 'N/A (Sheriff disconnected)',
            isMafia: false
          });
        }
      }

      // Medic phase - if disconnected medic, notify narrator
      if (game.phase === 'medic-saving' && game.roles[socket.id] === 'Medic') {
        const aliveMedics = game.players.filter(p => p.alive && game.roles[p.id] === 'Medic');
        if (aliveMedics.length === 0) {
          io.to(game.narratorId).emit('medic-done', {
            targetName: 'N/A (Medic disconnected)',
            saved: false
          });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Mafia server running on port ${PORT}`);
});
