import { useState, useEffect } from 'react'

function PlayerView({ socket, gameCode, playerName }) {
  const [role, setRole] = useState(null)
  const [phase, setPhase] = useState('waiting')
  const [players, setPlayers] = useState([])
  const [trialPlayers, setTrialPlayers] = useState([])
  const [selectedTarget, setSelectedTarget] = useState(null)
  const [mafiaVotesStatus, setMafiaVotesStatus] = useState(null)
  const [sheriffResult, setSheriffResult] = useState(null)
  const [sheriffWaiting, setSheriffWaiting] = useState(false)
  const [sheriffDisagree, setSheriffDisagree] = useState(false)
  const [medicResult, setMedicResult] = useState(null)
  const [medicWaiting, setMedicWaiting] = useState(false)
  const [medicDisagree, setMedicDisagree] = useState(false)
  const [townWakeInfo, setTownWakeInfo] = useState(null)
  const [trialVotes, setTrialVotes] = useState([])
  const [allVoted, setAllVoted] = useState(false)
  const [trialResult, setTrialResult] = useState(null)
  const [gameOver, setGameOver] = useState(null)
  const [hasVoted, setHasVoted] = useState(false)
  const [hasNominated, setHasNominated] = useState(false)

  useEffect(() => {
    socket.on('role-assigned', (data) => {
      setRole(data.role)
      setPhase('role-reveal')
    })

    socket.on('phase-change', (data) => {
      setPhase(data.phase)
      setSelectedTarget(null)
      setHasVoted(false)
      setHasNominated(false)
      setSheriffResult(null)
      setSheriffWaiting(false)
      setSheriffDisagree(false)
      setMedicResult(null)
      setMedicWaiting(false)
      setMedicDisagree(false)
      if (data.players) setPlayers(data.players)
      if (data.trialPlayers) setTrialPlayers(data.trialPlayers)
    })

    socket.on('mafia-votes-status', (data) => {
      setMafiaVotesStatus(data)
    })

    socket.on('sheriff-result', (data) => {
      setSheriffResult(data)
      setSheriffWaiting(false)
    })

    socket.on('sheriff-waiting', () => {
      setSheriffWaiting(true)
    })

    socket.on('sheriff-disagree', () => {
      setSheriffDisagree(true)
      setSheriffWaiting(false)
      setSelectedTarget(null)
      setTimeout(() => setSheriffDisagree(false), 3000)
    })

    socket.on('medic-result', (data) => {
      setMedicResult(data)
      setMedicWaiting(false)
    })

    socket.on('medic-waiting', () => {
      setMedicWaiting(true)
    })

    socket.on('medic-disagree', () => {
      setMedicDisagree(true)
      setMedicWaiting(false)
      setSelectedTarget(null)
      setTimeout(() => setMedicDisagree(false), 3000)
    })

    socket.on('town-wake-up', (data) => {
      setTownWakeInfo(data)
      setPhase('town-wake')
      setPlayers(data.alivePlayers || [])
    })

    socket.on('trial-votes-update', (data) => {
      setTrialVotes(data.votes)
      setAllVoted(data.allVoted)
    })

    socket.on('trial-result', (data) => {
      setTrialResult(data)
      setPhase('trial-result')
    })

    socket.on('game-over', (data) => {
      setGameOver(data)
      setPhase('game-over')
    })

    socket.on('game-ended', (data) => {
      setPhase('disconnected')
    })

    return () => {
      socket.off('role-assigned')
      socket.off('phase-change')
      socket.off('mafia-votes-status')
      socket.off('sheriff-result')
      socket.off('sheriff-waiting')
      socket.off('sheriff-disagree')
      socket.off('medic-result')
      socket.off('medic-waiting')
      socket.off('medic-disagree')
      socket.off('town-wake-up')
      socket.off('trial-votes-update')
      socket.off('trial-result')
      socket.off('game-over')
      socket.off('game-ended')
    }
  }, [socket])

  const handleMafiaVote = (targetId) => {
    setSelectedTarget(targetId)
    setHasVoted(true)
    socket.emit('mafia-vote', { targetId })
  }

  const handleSheriffCheck = (targetId) => {
    setSelectedTarget(targetId)
    setHasVoted(true)
    socket.emit('sheriff-check', { targetId })
  }

  const handleMedicSave = (targetId) => {
    setSelectedTarget(targetId)
    setHasVoted(true)
    socket.emit('medic-save', { targetId })
  }

  const handleNominate = (targetId) => {
    setSelectedTarget(targetId)
    setHasNominated(true)
    socket.emit('nominate', { targetId })
  }

  const handleTrialVote = (targetId) => {
    setSelectedTarget(targetId)
    setHasVoted(true)
    socket.emit('trial-vote', { targetId })
  }

  // Game Over Screen
  if (phase === 'game-over' && gameOver) {
    return (
      <div className="player-view">
        <div className="game-over-screen">
          <h1 className={gameOver.winner === 'mafia' ? 'mafia-text' : 'town-text'}>
            {gameOver.winner === 'mafia' ? 'MAFIA WINS!' : 'TOWN WINS!'}
          </h1>
          {gameOver.killedName && (
            <p className="final-kill">Last eliminated: {gameOver.killedName}</p>
          )}
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

  // Disconnected
  if (phase === 'disconnected') {
    return (
      <div className="player-view">
        <div className="center-message">
          <h2>Game Ended</h2>
          <p>The Narrator has disconnected.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="player-view">
      <div className="player-header">
        <span className="player-name-display">{playerName}</span>
        {role && <span className={`role-tag ${role.toLowerCase()}`}>{role}</span>}
      </div>

      {/* WAITING IN LOBBY */}
      {phase === 'waiting' && (
        <div className="center-message">
          <div className="waiting-icon">&#x23F3;</div>
          <h2>Waiting for Narrator</h2>
          <p>Game Code: <strong>{gameCode}</strong></p>
          <p>Sit tight while other players join...</p>
        </div>
      )}

      {/* ROLE REVEAL */}
      {phase === 'role-reveal' && role && (
        <div className="center-message role-reveal-screen">
          <h2>Your Role</h2>
          <div className={`role-reveal-card ${role.toLowerCase()}`}>
            <div className="role-icon">
              {role === 'Mafia' && '&#x1F5E1;'}
              {role === 'Sheriff' && '&#x2B50;'}
              {role === 'Medic' && '&#x2695;'}
              {role === 'Town' && '&#x1F3E0;'}
            </div>
            <h1 className="role-title">{role === 'Mafia' ? 'Member of The Mafia' : role === 'Town' ? 'Member of The Town' : role}</h1>
            <p className="role-desc">
              {role === 'Mafia' && 'Eliminate the town members one by one without getting caught.'}
              {role === 'Sheriff' && 'Investigate one player each night to find the Mafia.'}
              {role === 'Medic' && 'Save one player each night from the Mafia.'}
              {role === 'Town' && 'Find and vote out the Mafia members during the day.'}
            </p>
          </div>
          <p className="hint">Keep your role secret!</p>
        </div>
      )}

      {/* SLEEP */}
      {phase === 'sleep' && (
        <div className="sleep-screen">
          <div className="moon-icon">&#x1F319;</div>
          <h2>Shhh...</h2>
          <p>Close your eyes and go to sleep.</p>
        </div>
      )}

      {/* MAFIA VOTE */}
      {phase === 'mafia-vote' && (
        <div className="action-screen mafia-screen">
          <h2>Mafia - Choose Your Target</h2>
          <p className="phase-desc">Vote to eliminate a player</p>
          {!hasVoted ? (
            <div className="player-grid">
              {players.map((p, i) => (
                <button
                  key={i}
                  className="player-vote-btn mafia-btn"
                  onClick={() => handleMafiaVote(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="voted-message">
              <p>Vote submitted!</p>
              {mafiaVotesStatus && (
                <div className="vote-status">
                  <h4>Current Votes:</h4>
                  {mafiaVotesStatus.votes.map((v, i) => (
                    <div key={i} className="vote-entry small">
                      <span>{v.voter}</span> <span className="arrow">&#x2192;</span> <span>{v.target}</span>
                    </div>
                  ))}
                  {mafiaVotesStatus.allVoted ? (
                    <p className="all-voted">All Mafia members have voted!</p>
                  ) : (
                    <p className="waiting-text">Waiting for other Mafia members...</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SHERIFF INVESTIGATE */}
      {phase === 'sheriff-investigate' && (
        <div className="action-screen sheriff-screen">
          <h2>Sheriff - Investigate</h2>
          <p className="phase-desc">Choose a player to investigate</p>
          {sheriffDisagree && (
            <div className="disagree-msg">Both Sheriffs must agree! Pick again.</div>
          )}
          {sheriffWaiting && (
            <div className="waiting-msg">Waiting for the other Sheriff...</div>
          )}
          {sheriffResult ? (
            <div className={`big-result ${sheriffResult.isMafia ? 'result-mafia' : 'result-town'}`}>
              <h1>{sheriffResult.isMafia ? 'MAFIA' : 'TOWN MEMBER'}</h1>
              <p>{sheriffResult.targetName}</p>
            </div>
          ) : !hasVoted ? (
            <div className="player-grid">
              {players.map((p, i) => (
                <button
                  key={i}
                  className="player-vote-btn sheriff-btn"
                  onClick={() => handleSheriffCheck(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : !sheriffResult && !sheriffWaiting && (
            <div className="voted-message">
              <p>Selection submitted. Waiting for result...</p>
            </div>
          )}
        </div>
      )}

      {/* MEDIC SAVE */}
      {phase === 'medic-save' && (
        <div className="action-screen medic-screen">
          <h2>Medic - Save a Player</h2>
          <p className="phase-desc">Choose who to save tonight</p>
          {medicDisagree && (
            <div className="disagree-msg">Both Medics must agree! Pick again.</div>
          )}
          {medicWaiting && (
            <div className="waiting-msg">Waiting for the other Medic...</div>
          )}
          {medicResult ? (
            <div className={`big-result ${medicResult.saved ? 'result-saved' : 'result-failed'}`}>
              <h1>{medicResult.saved ? 'MEDIC SAVE' : 'X'}</h1>
              <p>{medicResult.saved ? 'You saved them!' : 'Wrong person...'}</p>
            </div>
          ) : !hasVoted ? (
            <div className="player-grid">
              {players.map((p, i) => (
                <button
                  key={i}
                  className="player-vote-btn medic-btn"
                  onClick={() => handleMedicSave(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : !medicResult && !medicWaiting && (
            <div className="voted-message">
              <p>Selection submitted. Waiting for result...</p>
            </div>
          )}
        </div>
      )}

      {/* TOWN WAKE UP - RESULTS */}
      {phase === 'town-wake' && townWakeInfo && (
        <div className="action-screen day-screen">
          <div className="sun-icon">&#x2600;</div>
          <h2>Good Morning, Town!</h2>
          {townWakeInfo.killedName && !townWakeInfo.wasSaved && (
            <div className="announcement death-announcement">
              <p><strong>{townWakeInfo.killedName}</strong></p>
              <p>was eliminated by the Mafia last night.</p>
            </div>
          )}
          {townWakeInfo.wasSaved && (
            <div className="announcement save-announcement">
              <p>The Medic saved someone!</p>
              <p>No one was eliminated last night.</p>
            </div>
          )}
          {!townWakeInfo.killedName && !townWakeInfo.wasSaved && (
            <div className="announcement">
              <p>No one was killed last night.</p>
            </div>
          )}
          <p className="hint">Discuss with the town who you think is in the Mafia...</p>
        </div>
      )}

      {/* NOMINATIONS */}
      {phase === 'nominate' && (
        <div className="action-screen day-screen">
          <h2>Nominate for Trial</h2>
          <p className="phase-desc">Who do you think should be put on trial?</p>
          {!hasNominated ? (
            <div className="player-grid">
              {players.map((p, i) => (
                <button
                  key={i}
                  className="player-vote-btn nominate-btn"
                  onClick={() => handleNominate(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="voted-message">
              <p>Nomination submitted!</p>
              <p className="waiting-text">Waiting for other players...</p>
            </div>
          )}
        </div>
      )}

      {/* TRIALS */}
      {phase === 'trials' && (
        <div className="action-screen day-screen">
          <h2>On Trial</h2>
          <p className="phase-desc">These players must plead their case:</p>
          <div className="trial-list">
            {trialPlayers.map((p, i) => (
              <div key={i} className="trial-player-card">
                <span className="trial-number">#{i + 1}</span>
                <span className="trial-name">{p.name}</span>
              </div>
            ))}
          </div>
          <p className="hint">Listen to each player's defense...</p>
        </div>
      )}

      {/* VOTING */}
      {phase === 'voting' && (
        <div className="action-screen day-screen">
          <h2>Vote to Eliminate</h2>
          {!hasVoted ? (
            <div className="player-grid">
              {trialPlayers.map((p, i) => (
                <button
                  key={i}
                  className="player-vote-btn vote-btn"
                  onClick={() => handleTrialVote(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="voted-message">
              <p>Vote submitted!</p>
            </div>
          )}
          {trialVotes.length > 0 && (
            <div className="public-votes">
              <h4>Votes Cast:</h4>
              {trialVotes.map((v, i) => (
                <div key={i} className="vote-entry">
                  <span className="voter">{v.voter}</span>
                  <span className="arrow">&#x2192;</span>
                  <span className="target">{v.target}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TRIAL RESULT */}
      {phase === 'trial-result' && trialResult && (
        <div className="action-screen day-screen">
          <h2>Elimination Result</h2>
          <div className={`trial-result-card ${trialResult.killedRole.includes('Mafia') ? 'mafia' : 'town'}`}>
            <p className="eliminated-name">{trialResult.killedName}</p>
            <p className="eliminated-role">was {trialResult.killedRole}</p>
          </div>
          <p className="hint">Waiting for the Narrator to continue...</p>
        </div>
      )}
    </div>
  )
}

export default PlayerView
