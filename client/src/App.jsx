import { useState } from 'react'
import { io } from 'socket.io-client'
import Home from './components/Home'
import NarratorView from './components/NarratorView'
import PlayerView from './components/PlayerView'
import './App.css'

function App() {
  const [socket, setSocket] = useState(null)
  const [view, setView] = useState('home')
  const [gameCode, setGameCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [error, setError] = useState('')

  const connectSocket = () => {
    if (socket) return socket
    const s = io()
    setSocket(s)
    return s
  }

  const handleCreateGame = () => {
    const s = connectSocket()
    s.emit('create-game', (response) => {
      if (response.success) {
        setGameCode(response.code)
        setView('narrator')
        setError('')
      } else {
        setError('Failed to create game')
      }
    })
  }

  const handleJoinGame = (code, name) => {
    const s = connectSocket()
    s.emit('join-game', { code: code.toUpperCase(), name }, (response) => {
      if (response.success) {
        setGameCode(code.toUpperCase())
        setPlayerName(name)
        setView('player')
        setError('')
      } else {
        setError(response.error || 'Failed to join game')
      }
    })
  }

  return (
    <div className="app">
      {view === 'home' && (
        <Home
          onCreateGame={handleCreateGame}
          onJoinGame={handleJoinGame}
          error={error}
        />
      )}
      {view === 'narrator' && socket && (
        <NarratorView socket={socket} gameCode={gameCode} />
      )}
      {view === 'player' && socket && (
        <PlayerView socket={socket} gameCode={gameCode} playerName={playerName} />
      )}
    </div>
  )
}

export default App
