import { useState, useEffect } from 'react'

function NarratorView({ socket, gameCode }) {
  const [players, setPlayers] = useState([])
  const [roles, setRoles] = useState([])
  const [phase, setPhase] = useState('lobby')
  const [mafiaVotes, setMafiaVotes] = useState(null)
  const [sheriffInfo, setSheriffInfo] = useState(null)
  const [medicInfo, setMedicInfo] = useState(null)
  const [nightResult, setNightResult] = useState(null)
  const [nominations, setNominations] = useState([])
  const [allNominated, setAllNominated] = useState(false)
  const [trialPlayers, setTrialPlayers] = useState([])
  const [trialVotes, setTrialVotes] = useState([])
  const [trialResult, setTrialResult] = useState(null)
  const [gameOver, setGameOver] = useState(null)
  const [selectedTrialPlayers, setSelectedTrialPlayers] = useState([])
  const [killTarget, setKillTarget] = useState(null)

  useEffect(() => {
    socket.on('player-joined', (data) => {
      setPlayers(data.players)
    })

    socket.on('mafia-votes-update', (data) => {
      setMafiaVotes(data)
    })

    socket.on('sheriff-done', (data) => {
      setSheriffInfo(data)
    })

    socket.on('medic-done', (data) => {
      setMedicInfo(data)
    })

    socket.on('town-wake-up', (data) => {
      setNightResult(data)
    })

    socket.on('nominations-update', (data) => {
      setNominations(data.nominations)
      setAllNominated(data.allNominated)
    })

    socket.on('phase-change', (data) => {
      if (data.phase === 'trials') {
        setTrialPlayers(data.trialPlayers)
      }
    })

    socket.on('trial-votes-update', (data) => {
      setTrialVotes(data.votes)
    })

    socket.on('trial-result', (data) => {
      setTrialResult(data)
      setPhase('day-result')
    })

    socket.on('game-over', (data) => {
      setGameOver(data)
      setPhase('game-over')
    })

    return () => {
      socket.off('player-joined')
      socket.off('mafia-votes-update')
      socket.off('sheriff-done')
      socket.off('medic-done')
      socket.off('town-wake-up')
      socket.off('nominations-update')
      socket.off('phase-change')
      socket.off('trial-votes-update')
      socket.off('trial-result')
      socket.off('game-over')
    }
  }, [socket])

  const handleAssignRoles = () => {
    socket.emit('assign-roles', (response) => {
      if (response.success) {
        setRoles(response.roles)
        setPhase('roles-assigned')
      } else {
        alert(response.error || 'Failed to assign roles')
      }
    })
  }

  const handleTownSleep = () => {
    socket.emit('town-sleep')
    setPhase('night')
    setMafiaVotes(null)
    setSheriffInfo(null)
    setMedicInfo(null)
    setKillTarget(null)
  }

  const handleMafiaWake = () => {
    socket.emit('mafia-wake')
    setPhase('mafia-voting')
  }

  const handleConfirmKill = (targetId) => {
    socket.emit('confirm-kill', { targetId })
    setKillTarget(targetId)
  }

  const handleMafiaSleep = () => {
    socket.emit('mafia-sleep')
    setPhase('mafia-done')
  }

  const handleSheriffWake = () => {
    socket.emit('sheriff-wake')
    setPhase('sheriff-investigating')
  }

  const handleSheriffSleep = () => {
    socket.emit('sheriff-sleep')
    setPhase('sheriff-done')
  }

  const handleMedicWake = () => {
    socket.emit('medic-wake')
    setPhase('medic-saving')
  }

  const handleMedicSleep = () => {
    socket.emit('medic-sleep')
    setPhase('medic-done')
  }

  const handleTownWake = () => {
    socket.emit('town-wake')
    setPhase('day-reveal')
  }

  const handleStartNominations = () => {
    socket.emit('start-nominations')
    setPhase('nominations')
    setNominations([])
    setAllNominated(false)
  }

  const toggleTrialPlayer = (id) => {
    setSelectedTrialPlayers(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id)
      if (prev.length >= 4) return prev
      return [...prev, id]
    })
  }

  const handleStartTrials = () => {
    socket.emit('start-trials', { trialPlayerIds: selectedTrialPlayers })
    setPhase('trials')
  }

  const handleStartVoting = () => {
    socket.emit('start-voting')
    setPhase('voting')
    setTrialVotes([])
  }

  const handleNextRound = () => {
    socket.emit('next-round')
    setPhase('night-ready')
    setTrialResult(null)
    setSelectedTrialPlayers([])
    setNominations([])
    setTrialVotes([])
  }

  // Game Over
  if (phase === 'game-over' && gameOver) {
    return (
      <div className="narrator-view">
        <div className="game-over-screen">
          <h1 className={gameOver.winner === 'mafia' ? 'mafia-text' : 'town-text'}>
            {gameOver.winner === 'mafia' ? 'MAFIA WINS!' : 'TOWN WINS!'}
          </h1>
          <div className="roles-list final-roles">
            {gameOver.roles.map((r, i) => (
              <div key={i} className={`role-card ${r.role.toLowerCase()} ${!r.alive ? 'dead' : ''}`}>
                <span className="role-name">{r.name}</span>
                <span className={`role-badge ${r.role.toLowerCase()}`}>{r.role}</span>
                {!r.alive && <span className="dead-badge">ELIMINATED</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="narrator-view">
      <div className="narrator-header">
        <h2>Narrator Dashboard</h2>
        <div className="game-code-display">
          Game Code: <span className="code">{gameCode}</span>
        </div>
        <div className="phase-indicator">Phase: <span>{phase}</span></div>
      </div>

      {/* LOBBY */}
      {phase === 'lobby' && (
        <div className="phase-panel">
          <h3>Waiting for Players</h3>
          <div className="player-count">{players.length} player{players.length !== 1 ? 's' : ''} joined</div>
          <div className="player-list">
            {players.map((p, i) => (
              <div key={i} className="player-chip">{p.name}</div>
            ))}
          </div>
          {players.length >= 4 && (
            <button className="btn btn-primary btn-large" onClick={handleAssignRoles}>
              Assign Roles
            </button>
          )}
          {players.length < 4 && (
            <p className="hint">Need at least 4 players to start</p>
          )}
        </div>
      )}

      {/* ROLES ASSIGNED */}
      {phase === 'roles-assigned' && (
        <div className="phase-panel">
          <h3>Roles Assigned</h3>
          <div className="roles-list">
            {roles.map((r, i) => (
              <div key={i} className={`role-card ${r.role.toLowerCase()}`}>
                <span className="role-name">{r.name}</span>
                <span className={`role-badge ${r.role.toLowerCase()}`}>{r.role}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-dark btn-large" onClick={handleTownSleep}>
            Town Go To Sleep
          </button>
        </div>
      )}

      {/* NIGHT - Ready for Mafia */}
      {(phase === 'night' || phase === 'night-ready') && (
        <div className="phase-panel night-panel">
          <h3>Night Time</h3>
          <p className="phase-desc">The town is asleep...</p>
          <button className="btn btn-danger btn-large" onClick={handleMafiaWake}>
            Mafia Wake Up
          </button>
        </div>
      )}

      {/* MAFIA VOTING */}
      {phase === 'mafia-voting' && (
        <div className="phase-panel night-panel">
          <h3>Mafia is Voting</h3>
          {mafiaVotes && (
            <>
              <div className="vote-list">
                {mafiaVotes.votes.map((v, i) => (
                  <div key={i} className="vote-entry">
                    <span className="voter">{v.voter}</span>
                    <span className="arrow">&#x2192;</span>
                    <span className="target">{v.target}</span>
                  </div>
                ))}
              </div>
              {mafiaVotes.allVoted && (
                <div className="vote-summary">
                  <h4>Vote Totals:</h4>
                  {mafiaVotes.voteCounts.map((vc, i) => (
                    <div key={i} className="vote-count-row">
                      <span>{vc.name}: {vc.count} vote{vc.count !== 1 ? 's' : ''}</span>
                      {!killTarget && (
                        <button className="btn btn-danger btn-small" onClick={() => handleConfirmKill(vc.targetId)}>
                          Kill
                        </button>
                      )}
                    </div>
                  ))}
                  {killTarget && (
                    <div className="confirmed-kill">
                      Kill confirmed!
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          {killTarget && (
            <button className="btn btn-dark btn-large" onClick={handleMafiaSleep}>
              Mafia Go To Sleep
            </button>
          )}
        </div>
      )}

      {/* MAFIA DONE - Sheriff next */}
      {phase === 'mafia-done' && (
        <div className="phase-panel night-panel">
          <h3>Mafia is Asleep</h3>
          <button className="btn btn-blue btn-large" onClick={handleSheriffWake}>
            Sheriff Wake Up
          </button>
        </div>
      )}

      {/* SHERIFF INVESTIGATING */}
      {phase === 'sheriff-investigating' && (
        <div className="phase-panel night-panel">
          <h3>Sheriff is Investigating</h3>
          <p className="phase-desc">Waiting for the Sheriff to pick someone...</p>
          {sheriffInfo && (
            <div className={`sheriff-result ${sheriffInfo.isMafia ? 'mafia' : 'town'}`}>
              <p>Sheriff checked: <strong>{sheriffInfo.targetName}</strong></p>
              <p className="result-text">{sheriffInfo.isMafia ? 'MAFIA!' : 'TOWN MEMBER'}</p>
            </div>
          )}
          {sheriffInfo && (
            <button className="btn btn-dark btn-large" onClick={handleSheriffSleep}>
              Sheriff Go To Sleep
            </button>
          )}
        </div>
      )}

      {/* SHERIFF DONE - Medic next */}
      {phase === 'sheriff-done' && (
        <div className="phase-panel night-panel">
          <h3>Sheriff is Asleep</h3>
          <button className="btn btn-green btn-large" onClick={handleMedicWake}>
            Medic Wake Up
          </button>
        </div>
      )}

      {/* MEDIC SAVING */}
      {phase === 'medic-saving' && (
        <div className="phase-panel night-panel">
          <h3>Medic is Choosing</h3>
          <p className="phase-desc">Waiting for the Medic to pick someone to save...</p>
          {medicInfo && (
            <div className={`medic-result ${medicInfo.saved ? 'saved' : 'not-saved'}`}>
              <p>Medic picked: <strong>{medicInfo.targetName}</strong></p>
              <p className="result-text">{medicInfo.saved ? 'SAVED!' : 'Wrong person'}</p>
            </div>
          )}
          {medicInfo && (
            <button className="btn btn-dark btn-large" onClick={handleMedicSleep}>
              Medic Go To Sleep
            </button>
          )}
        </div>
      )}

      {/* MEDIC DONE - Town wakes up */}
      {phase === 'medic-done' && (
        <div className="phase-panel night-panel">
          <h3>Medic is Asleep</h3>
          <button className="btn btn-primary btn-large" onClick={handleTownWake}>
            Town Wake Up
          </button>
        </div>
      )}

      {/* DAY REVEAL */}
      {phase === 'day-reveal' && nightResult && (
        <div className="phase-panel day-panel">
          <h3>Day Time</h3>
          {nightResult.killedName && !nightResult.wasSaved && (
            <div className="night-announcement death">
              <p><strong>{nightResult.killedName}</strong> was eliminated by the Mafia.</p>
            </div>
          )}
          {nightResult.wasSaved && (
            <div className="night-announcement saved">
              <p>The Medic saved someone tonight! No one was eliminated.</p>
            </div>
          )}
          {!nightResult.killedName && !nightResult.wasSaved && (
            <div className="night-announcement">
              <p>No one was killed tonight.</p>
            </div>
          )}
          <button className="btn btn-primary btn-large" onClick={handleStartNominations}>
            Start Nominations
          </button>
        </div>
      )}

      {/* NOMINATIONS */}
      {phase === 'nominations' && (
        <div className="phase-panel day-panel">
          <h3>Nominations</h3>
          <p className="phase-desc">Players are nominating who to put on trial...</p>
          <div className="nomination-list">
            {nominations.map((n, i) => (
              <div
                key={i}
                className={`nomination-entry ${selectedTrialPlayers.includes(n.targetId) ? 'selected' : ''}`}
                onClick={() => toggleTrialPlayer(n.targetId)}
              >
                <span className="nom-name">{n.name}</span>
                <span className="nom-count">{n.count} nomination{n.count !== 1 ? 's' : ''}</span>
              </div>
            ))}
          </div>
          <p className="hint">Select up to 4 players for trial (click to select)</p>
          {selectedTrialPlayers.length > 0 && (
            <button className="btn btn-primary btn-large" onClick={handleStartTrials}>
              Start Trials ({selectedTrialPlayers.length} selected)
            </button>
          )}
        </div>
      )}

      {/* TRIALS */}
      {phase === 'trials' && (
        <div className="phase-panel day-panel">
          <h3>Trials</h3>
          <p className="phase-desc">Players on trial are pleading their case...</p>
          <div className="trial-list">
            {trialPlayers.map((p, i) => (
              <div key={i} className="trial-player">{p.name}</div>
            ))}
          </div>
          <button className="btn btn-primary btn-large" onClick={handleStartVoting}>
            Start Voting
          </button>
        </div>
      )}

      {/* VOTING */}
      {phase === 'voting' && (
        <div className="phase-panel day-panel">
          <h3>Voting</h3>
          <div className="vote-list public-votes">
            {trialVotes.map((v, i) => (
              <div key={i} className="vote-entry">
                <span className="voter">{v.voter}</span>
                <span className="arrow">&#x2192;</span>
                <span className="target">{v.target}</span>
              </div>
            ))}
          </div>
          <p className="hint">Waiting for all alive players to vote...</p>
        </div>
      )}

      {/* DAY RESULT */}
      {phase === 'day-result' && trialResult && (
        <div className="phase-panel day-panel">
          <h3>Voting Complete</h3>
          <div className="trial-announcement">
            <p><strong>{trialResult.killedName}</strong> has been eliminated!</p>
            <p className={`role-reveal ${trialResult.killedRole.includes('Mafia') ? 'mafia' : 'town'}`}>
              They were {trialResult.killedRole}
            </p>
          </div>
          <button className="btn btn-dark btn-large" onClick={handleNextRound}>
            Next Round - Town Go To Sleep
          </button>
        </div>
      )}

      {/* ROLE REFERENCE (always visible for narrator) */}
      {roles.length > 0 && phase !== 'lobby' && phase !== 'game-over' && (
        <div className="roles-reference">
          <h4>Player Roles (Your Eyes Only)</h4>
          <div className="roles-mini">
            {roles.map((r, i) => {
              const playerObj = players.find(p => p.id === r.id) ||
                                (nightResult?.alivePlayers || []).find(p => p.id === r.id)
              const isAlive = nightResult?.alivePlayers ?
                nightResult.alivePlayers.some(p => p.id === r.id) : true
              return (
                <div key={i} className={`role-mini ${r.role.toLowerCase()} ${!isAlive ? 'dead' : ''}`}>
                  <span>{r.name}</span>
                  <span className={`badge ${r.role.toLowerCase()}`}>{r.role}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default NarratorView
