import { useState } from 'react'

function Home({ onCreateGame, onJoinGame, error }) {
  const [joinCode, setJoinCode] = useState('')
  const [name, setName] = useState('')
  const [showJoin, setShowJoin] = useState(false)

  const handleJoin = (e) => {
    e.preventDefault()
    if (joinCode.trim() && name.trim()) {
      onJoinGame(joinCode.trim(), name.trim())
    }
  }

  return (
    <div className="home-screen">
      <div className="logo-container">
        <h1 className="game-title">MAFIA</h1>
        <p className="game-subtitle">The Party Game</p>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {!showJoin ? (
        <div className="home-buttons">
          <button className="btn btn-primary" onClick={onCreateGame}>
            <span className="btn-icon">&#x1F3AD;</span>
            Host Game (Narrator)
          </button>
          <button className="btn btn-secondary" onClick={() => setShowJoin(true)}>
            <span className="btn-icon">&#x1F464;</span>
            Join Game (Player)
          </button>
        </div>
      ) : (
        <form className="join-form" onSubmit={handleJoin}>
          <input
            type="text"
            placeholder="Enter Game Code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            className="input-field"
            maxLength={5}
            autoFocus
          />
          <input
            type="text"
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input-field"
            maxLength={20}
          />
          <button type="submit" className="btn btn-primary" disabled={!joinCode.trim() || !name.trim()}>
            Join Game
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowJoin(false)}>
            Back
          </button>
        </form>
      )}
    </div>
  )
}

export default Home
