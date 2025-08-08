'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface GameObject {
  x: number
  y: number
  width: number
  height: number
}

interface Pipe extends GameObject {
  passed: boolean
}

interface Bubble {
  x: number
  y: number
  r: number
  vy: number
  wobble: number
}

type PeanutSkin = 'classic' | 'salted' | 'honey' | 'chocolate' | 'spicy' | 'cool'

const GAME_WIDTH = 800
const GAME_HEIGHT = 600

// Player and physics
const PLAYER_SIZE = 40
const GRAVITY = 0.5
const JUMP_FORCE = -10
const MAX_FALL_SPEED = 12

// Obstacles (forks)
const PIPE_WIDTH = 80
const PIPE_GAP = 280             // easier gap
const SPAWN_INTERVAL = 140       // farther apart horizontally
const GAME_SPEED = 3.9           // 1.3x faster

// Soup (lava-like)
const SOUP_BASE_Y = GAME_HEIGHT - 60

// LocalStorage key
const SKIN_KEY = 'flappy-soup-selected-skin-v1'

export default function FlappySoupGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameLoopRef = useRef<number>()

  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameOver'>('menu')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [skin, setSkin] = useState<PeanutSkin>('classic')

  const gameDataRef = useRef({
    player: {
      x: 150,
      y: GAME_HEIGHT / 2,
      width: PLAYER_SIZE,
      height: PLAYER_SIZE,
      velocity: 0
    },
    pipes: [] as Pipe[],
    bubbles: [] as Bubble[],
    frameCount: 0
  })

  // Load/save skin preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SKIN_KEY) as PeanutSkin | null
      if (saved) setSkin(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(SKIN_KEY, skin)
    } catch {}
  }, [skin])

  const resetGame = useCallback(() => {
    gameDataRef.current = {
      player: {
        x: 150,
        y: GAME_HEIGHT / 2,
        width: PLAYER_SIZE,
        height: PLAYER_SIZE,
        velocity: 0
      },
      pipes: [],
      bubbles: [],
      frameCount: 0
    }
    setScore(0)
  }, [])

  const jump = useCallback(() => {
    if (gameState === 'playing') {
      gameDataRef.current.player.velocity = JUMP_FORCE
    }
  }, [gameState])

  const startGame = useCallback(() => {
    resetGame()
    setGameState('playing')
  }, [resetGame])

  const toMenu = useCallback(() => {
    setGameState('menu')
  }, [])

  const endGame = useCallback(() => {
    setGameState('gameOver')
    setHighScore(prev => Math.max(prev, score))
  }, [score])

  // Input
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault()
        if (gameState === 'menu' || gameState === 'gameOver') {
          startGame()
        } else if (gameState === 'playing') {
          jump()
        }
      }
    }
    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [gameState, startGame, jump])

  // Soup surface function (wavy lava-like)
  const soupSurfaceYAt = (x: number, frame: number) => {
    const a1 = 10
    const a2 = 6
    const k1 = 0.015
    const k2 = 0.035
    const s1 = 0.06
    const s2 = 0.04
    return (
      SOUP_BASE_Y +
      Math.sin(x * k1 + frame * s1) * a1 +
      Math.sin(x * k2 - frame * s2) * a2
    )
  }

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gameLoop = () => {
      const game = gameDataRef.current
      game.frameCount++

      // Update player
      game.player.velocity += GRAVITY
      if (game.player.velocity > MAX_FALL_SPEED) game.player.velocity = MAX_FALL_SPEED
      game.player.y += game.player.velocity

      // Generate forks (pipes)
      if (game.frameCount % SPAWN_INTERVAL === 0) {
        const pipeHeight = Math.random() * (GAME_HEIGHT - PIPE_GAP - 200) + 100
        game.pipes.push({
          x: GAME_WIDTH,
          y: 0,
          width: PIPE_WIDTH,
          height: pipeHeight,
          passed: false
        })
        game.pipes.push({
          x: GAME_WIDTH,
          y: pipeHeight + PIPE_GAP,
          width: PIPE_WIDTH,
          height: GAME_HEIGHT - pipeHeight - PIPE_GAP,
          passed: false
        })
      }

      // Update forks
      game.pipes = game.pipes.filter((pipe) => {
        pipe.x -= GAME_SPEED

        // Score when passing the top fork body
        if (!pipe.passed && pipe.y === 0 && pipe.x + pipe.width < game.player.x) {
          pipe.passed = true
          setScore((prev) => prev + 1)
        }
        return pipe.x + pipe.width > 0
      })

      // Update soup bubbles (rise and pop at surface)
      if (game.frameCount % 12 === 0 && game.bubbles.length < 40) {
        game.bubbles.push({
          x: Math.random() * GAME_WIDTH,
          y: GAME_HEIGHT - 6,
          r: 2 + Math.random() * 5,
          vy: -0.6 - Math.random() * 0.9,
          wobble: Math.random() * Math.PI * 2
        })
      }
      game.bubbles = game.bubbles.filter((b) => {
        b.y += b.vy
        b.x += Math.sin(game.frameCount * 0.12 + b.wobble) * 0.25
        // Pop when reaching surface at their x
        const surface = soupSurfaceYAt(b.x, game.frameCount)
        return b.y + b.r < surface - 2
      })

      // Collision detection
      const player = game.player
      // Ceiling
      if (player.y < 0) {
        endGame()
        return
      }
      // Soup collision (use surface at player's center X)
      const playerCenterX = player.x + player.width / 2
      const soupSurfaceHere = soupSurfaceYAt(playerCenterX, game.frameCount)
      if (player.y + player.height > soupSurfaceHere) {
        endGame()
        return
      }
      // Fork collision (rectangular hitboxes same as pipes)
      for (const pipe of game.pipes) {
        if (
          player.x < pipe.x + pipe.width &&
          player.x + player.width > pipe.x &&
          player.y < pipe.y + pipe.height &&
          player.y + player.height > pipe.y
        ) {
          endGame()
          return
        }
      }

      // Render
      render(ctx)
      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }

    gameLoopRef.current = requestAnimationFrame(gameLoop)
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current)
    }
  }, [gameState, endGame, skin])

  // Fork rendering
  const renderFork = (
    ctx: CanvasRenderingContext2D,
    pipe: Pipe,
    frame: number
  ) => {
    const isTop = pipe.y === 0
    const handleWidth = 22
    const tineWidth = 6
    const tineGap = 6
    const tines = 4
    const tineLength = 28
    const cx = pipe.x + PIPE_WIDTH / 2

    // Metallic gradient
    const grad = ctx.createLinearGradient(0, pipe.y, 0, pipe.y + pipe.height)
    grad.addColorStop(0, '#f2f2f2')
    grad.addColorStop(0.5, '#cfcfcf')
    grad.addColorStop(1, '#e6e6e6')

    ctx.strokeStyle = '#a9a9a9'
    ctx.lineWidth = 2

    // Handle
    ctx.fillStyle = grad
    const handleX = cx - handleWidth / 2
    const handleH = Math.max(10, pipe.height - tineLength - 8)
    const handleY = isTop ? pipe.y : pipe.y + tineLength + 8
    ;(ctx as any).roundRect
      ? ctx.roundRect(handleX, handleY, handleWidth, handleH, 8)
      : ctx.fillRect(handleX, handleY, handleWidth, handleH)
    ctx.fill()
    ctx.stroke()

    // Tines
    const totalTinesWidth = tines * tineWidth + (tines - 1) * tineGap
    const tinesStartX = cx - totalTinesWidth / 2
    for (let i = 0; i < tines; i++) {
      const tx = tinesStartX + i * (tineWidth + tineGap)
      if (isTop) {
        const ty = pipe.height
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.rect(tx, ty, tineWidth, tineLength)
        ctx.fill()
        ctx.stroke()
        // Rounded tip
        ctx.beginPath()
        ctx.arc(tx + tineWidth / 2, ty + tineLength, tineWidth / 2, 0, Math.PI)
        ctx.fillStyle = '#dcdcdc'
        ctx.fill()
        ctx.stroke()
      } else {
        const ty = pipe.y
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.rect(tx, ty - tineLength, tineWidth, tineLength)
        ctx.fill()
        ctx.stroke()
        // Rounded tip
        ctx.beginPath()
        ctx.arc(tx + tineWidth / 2, ty - tineLength, tineWidth / 2, Math.PI, 0)
        ctx.fillStyle = '#dcdcdc'
        ctx.fill()
        ctx.stroke()
      }
    }

    // Subtle animated shine
    ctx.save()
    ctx.globalAlpha = 0.15
    ctx.fillStyle = 'white'
    const shineY = ((frame * 2) % (pipe.height + 60)) + (isTop ? pipe.y : pipe.y - 30)
    ctx.fillRect(handleX + 2, shineY, handleWidth - 4, 6)
    ctx.restore()
  }

  // Peanut drawing with skins
  const drawPeanut = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    velocity: number,
    skinType: PeanutSkin
  ) => {
    const w = size
    const h = size

    ctx.save()
    // Shadow for depth
    ctx.shadowColor = 'rgba(0,0,0,0.25)'
    ctx.shadowBlur = 10
    ctx.shadowOffsetY = 3

    // Position and rotate by velocity
    ctx.translate(x + w / 2, y + h / 2)
    const angle = Math.max(-0.6, Math.min(0.6, velocity * 0.04))
    ctx.rotate(angle)
    ctx.translate(-w / 2, -h / 2)

    // Base colors per skin
    let shellFill = '#D08A3F'
    let shellStroke = '#7A4A12'
    let textureStroke = '#9B5E22'
    if (skinType === 'chocolate') {
      shellFill = '#5A3A1E'
      shellStroke = '#3B2614'
      textureStroke = '#3B2614'
    } else if (skinType === 'honey') {
      shellFill = '#E39B2D'
      shellStroke = '#8B5E1A'
      textureStroke = '#A86F22'
    } else if (skinType === 'spicy') {
      shellFill = '#D45B2C'
      shellStroke = '#8B2E14'
      textureStroke = '#A44322'
    } else if (skinType === 'cool') {
      shellFill = '#C99254'
      shellStroke = '#7A4A12'
      textureStroke = '#8B5E22'
    } else if (skinType === 'salted') {
      shellFill = '#C98F57'
      shellStroke = '#7A4A12'
      textureStroke = '#8B5E22'
    }

    // Peanut shell
    ctx.fillStyle = shellFill
    ctx.strokeStyle = shellStroke
    ctx.lineWidth = 2

    // Figure-8 body within size box
    ctx.beginPath()
    ctx.ellipse(w * 0.5, h * 0.3, w * 0.45, h * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(w * 0.5, h * 0.7, w * 0.45, h * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // Texture lines
    ctx.strokeStyle = textureStroke
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(w * 0.18, h * 0.23)
    ctx.lineTo(w * 0.82, h * 0.28)
    ctx.moveTo(w * 0.18, h * 0.77)
    ctx.lineTo(w * 0.82, h * 0.72)
    ctx.moveTo(w * 0.22, h * 0.5)
    ctx.lineTo(w * 0.78, h * 0.5)
    ctx.stroke()

    // Decorations per skin
    if (skinType === 'salted') {
      // Fixed salt specks
      const specks = [
        [w * 0.3, h * 0.25],
        [w * 0.6, h * 0.22],
        [w * 0.45, h * 0.35],
        [w * 0.38, h * 0.62],
        [w * 0.55, h * 0.75],
        [w * 0.7, h * 0.58],
        [w * 0.25, h * 0.7]
      ]
      ctx.fillStyle = '#FFFFFF'
      specks.forEach(([sx, sy]) => {
        ctx.beginPath()
        ctx.arc(sx, sy, Math.max(1, w * 0.02), 0, Math.PI * 2)
        ctx.fill()
      })
    }

    if (skinType === 'honey') {
      // Glossy glaze
      const glaze = ctx.createLinearGradient(0, 0, 0, h)
      glaze.addColorStop(0, 'rgba(255, 220, 120, 0.6)')
      glaze.addColorStop(1, 'rgba(255, 180, 60, 0.0)')
      ctx.fillStyle = glaze
      ctx.beginPath()
      ctx.ellipse(w * 0.5, h * 0.5, w * 0.45, h * 0.48, 0, 0, Math.PI * 2)
      ctx.fill()
      // Drips
      ctx.fillStyle = 'rgba(255, 190, 80, 0.9)'
      ;[
        [w * 0.35, h * 0.62, h * 0.08],
        [w * 0.55, h * 0.68, h * 0.12]
      ].forEach(([dx, dy, dl]) => {
        ctx.beginPath()
        ctx.ellipse(dx as number, dy as number, w * 0.03, dl as number, 0, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    if (skinType === 'chocolate') {
      // Sprinkles
      const sprinkles = [
        [w * 0.32, h * 0.32, '#ff5e5e'],
        [w * 0.62, h * 0.28, '#5ec8ff'],
        [w * 0.45, h * 0.6, '#ffe05e'],
        [w * 0.55, h * 0.75, '#7aff7a'],
        [w * 0.28, h * 0.68, '#ff79d9']
      ] as const
      sprinkles.forEach(([sx, sy, c]) => {
        ctx.fillStyle = c
        ctx.fillRect(sx - 2, sy - 0.5, 4, 1)
      })
    }

    if (skinType === 'spicy') {
      // Chili sticker
      ctx.fillStyle = '#E53935'
      ctx.beginPath()
      ctx.ellipse(w * 0.68, h * 0.38, w * 0.08, h * 0.05, 0.3, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#2E7D32'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(w * 0.68, h * 0.33)
      ctx.lineTo(w * 0.72, h * 0.28)
      ctx.stroke()
    }

    // Face
    ctx.fillStyle = '#2F2F2F'
    if (skinType === 'cool') {
      // Sunglasses
      ctx.fillStyle = '#121212'
      const gW = w * 0.38
      const gH = h * 0.12
      const gX = w * 0.5 - gW / 2
      const gY = h * 0.35 - gH / 2
      ctx.fillRect(gX, gY, gW, gH)
      // Bridge
      ctx.fillRect(gX + gW * 0.45, gY, gW * 0.1, gH)
      // Tiny highlight
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(gX + 4, gY + 2, gW * 0.35, 2)
      // Smile
      ctx.strokeStyle = '#2F2F2F'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(w * 0.5, h * 0.5, 4, 0, Math.PI)
      ctx.stroke()
    } else {
      // Eyes
      ctx.fillStyle = '#2F2F2F'
      ctx.beginPath()
      ctx.arc(w * 0.4, h * 0.38, 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(w * 0.6, h * 0.38, 2, 0, Math.PI * 2)
      ctx.fill()
      // Smile
      ctx.strokeStyle = '#2F2F2F'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(w * 0.5, h * 0.47, 4, 0, Math.PI)
      ctx.stroke()
    }

    ctx.restore()
  }

  const renderSoup = (ctx: CanvasRenderingContext2D, frame: number) => {
    // Build the surface path
    const path = new Path2D()
    const startY = soupSurfaceYAt(0, frame)
    path.moveTo(0, startY)
    const step = 10
    for (let x = 0; x <= GAME_WIDTH; x += step) {
      path.lineTo(x, soupSurfaceYAt(x, frame))
    }
    path.lineTo(GAME_WIDTH, GAME_HEIGHT)
    path.lineTo(0, GAME_HEIGHT)
    path.closePath()

    // Base lava gradient fill
    const grad = ctx.createLinearGradient(0, SOUP_BASE_Y - 40, 0, GAME_HEIGHT)
    grad.addColorStop(0, '#ff7a1a')
    grad.addColorStop(0.4, '#ff4d00')
    grad.addColorStop(1, '#b33900')

    ctx.fillStyle = grad
    ctx.fill(path)

    // Flowing highlights along surface (gloss)
    ctx.save()
    ctx.globalAlpha = 0.25
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x <= GAME_WIDTH; x += step) {
      const y =
        soupSurfaceYAt(x, frame) + Math.sin((x + frame * 8) * 0.04) * 1.2
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.restore()

    // Subtle lava flow streaks
    ctx.save()
    ctx.globalAlpha = 0.15
    ctx.fillStyle = 'rgba(255, 200, 100, 0.6)'
    for (let i = 0; i < 6; i++) {
      const phase = frame * (0.6 + i * 0.05)
      const offsetX = ((phase + i * 120) % (GAME_WIDTH + 200)) - 200
      const top = SOUP_BASE_Y + i * 12
      ctx.beginPath()
      ctx.moveTo(offsetX, top)
      ctx.bezierCurveTo(
        offsetX + 80, top + 20,
        offsetX + 140, top + 10,
        offsetX + 220, top + 30
      )
      ctx.bezierCurveTo(
        offsetX + 300, top + 50,
        offsetX + 360, top + 30,
        offsetX + 420, top + 60
      )
      ctx.lineTo(offsetX + 420, GAME_HEIGHT)
      ctx.lineTo(offsetX, GAME_HEIGHT)
      ctx.closePath()
      ctx.fill()
    }
    ctx.restore()

    // Rising bubbles
    const bubbles = gameDataRef.current.bubbles
    for (const b of bubbles) {
      const radGrad = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r)
      radGrad.addColorStop(0, 'rgba(255,255,255,0.8)')
      radGrad.addColorStop(1, 'rgba(255,120,60,0.2)')
      ctx.fillStyle = radGrad
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fill()

      // Pop ring if near surface
      const surface = soupSurfaceYAt(b.x, frame)
      if (surface - b.y < 6) {
        ctx.save()
        ctx.globalAlpha = 0.35
        ctx.strokeStyle = 'white'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(b.x, surface - 1, b.r + 2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }
  }

  const render = (ctx: CanvasRenderingContext2D) => {
    const game = gameDataRef.current

    // Clear
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Background gradient (warm kitchen ambiance)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT)
    bgGrad.addColorStop(0, '#FFE8C8')
    bgGrad.addColorStop(0.6, '#F2C592')
    bgGrad.addColorStop(1, '#D89A63')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Soup / lava
    renderSoup(ctx, game.frameCount)

    // Forks (obstacles)
    for (const pipe of game.pipes) {
      renderFork(ctx, pipe, game.frameCount)
    }

    // Peanut
    drawPeanut(
      ctx,
      game.player.x,
      game.player.y,
      game.player.width,
      game.player.velocity,
      skin
    )

    // Score
    ctx.fillStyle = '#333'
    ctx.font = 'bold 32px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(score.toString(), GAME_WIDTH / 2, 50)
  }

  // Peanut skin list for UI
  const skins: { id: PeanutSkin; label: string; desc: string }[] = useMemo(() => ([
    { id: 'classic', label: 'Classic', desc: 'OG peanut vibes' },
    { id: 'salted', label: 'Salted', desc: 'Crunch with flakes' },
    { id: 'honey', label: 'Honey-Roasted', desc: 'Sweet glaze' },
    { id: 'chocolate', label: 'Chocolate', desc: 'Dessert mode' },
    { id: 'spicy', label: 'Spicy', desc: '🔥 heat' },
    { id: 'cool', label: 'Cool', desc: '😎 shades' },
  ]), [])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-orange-100 to-orange-200 p-4">
      <Card className="p-6 bg-white/90 backdrop-blur-sm shadow-2xl">
        <div className="text-center mb-4">
          <h1 className="text-4xl font-bold text-orange-800 mb-2">🥜 Flappy Soup Escape!</h1>
          <p className="text-orange-600">Choose your peanut and dodge the forks over lava soup.</p>
        </div>

        <div className="relative">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="border-4 border-orange-300 rounded-lg bg-white"
            onClick={gameState === 'playing' ? jump : startGame}
            aria-label="Game canvas"
            role="img"
          />

          {gameState === 'menu' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg p-4">
              <div className="text-white w-full max-w-2xl">
                <h2 className="text-3xl font-bold mb-3 text-center">Pick your Peanut</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {skins.map((s) => (
                    <PeanutOption
                      key={s.id}
                      selected={skin === s.id}
                      label={s.label}
                      desc={s.desc}
                      onSelect={() => setSkin(s.id)}
                      skin={s.id}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={startGame} size="lg" className="bg-orange-500 hover:bg-orange-600">
                    Start Game
                  </Button>
                </div>
              </div>
            </div>
          )}

          {gameState === 'gameOver' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
              <div className="text-center text-white px-4">
                <h2 className="text-3xl font-bold mb-4">💀 Game Over!</h2>
                <p className="text-xl mb-2">Score: {score}</p>
                <p className="text-lg mb-6">High Score: {highScore}</p>
                <div className="flex items-center justify-center gap-3">
                  <Button onClick={startGame} size="lg" className="bg-orange-500 hover:bg-orange-600">
                    Try Again
                  </Button>
                  <Button onClick={toMenu} variant="secondary" className="text-orange-700">
                    Change Peanut
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 text-center">
          <div className="flex justify-between items-center text-sm text-orange-700">
            <span>Score: {score}</span>
            <span>High Score: {highScore}</span>
            <span>Peanut: {skins.find(s => s.id === skin)?.label ?? 'Classic'}</span>
          </div>
          <p className="text-xs text-orange-500 mt-2">
            Press SPACE or click to flap!
          </p>
        </div>
      </Card>
    </div>
  )

  // Inline component: peanut option card with preview
  function PeanutOption({
    selected = false,
    label = 'Classic',
    desc = '',
    onSelect = () => {},
    skin = 'classic' as PeanutSkin,
  }) {
    const ref = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
      const c = ref.current
      if (!c) return
      const ctx = c.getContext('2d')
      if (!ctx) return
      // Clear
      ctx.clearRect(0, 0, c.width, c.height)
      // Subtle bg
      const g = ctx.createLinearGradient(0, 0, 0, c.height)
      g.addColorStop(0, 'rgba(255,255,255,0.6)')
      g.addColorStop(1, 'rgba(255,240,220,0.6)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, c.width, c.height)
      // Draw peanut centered
      const size = 36
      drawPeanut(ctx, (c.width - size) / 2, (c.height - size) / 2, size, 0, skin)
    }, [skin])

    return (
      <button
        onClick={onSelect}
        className={cn(
          'flex items-center gap-3 rounded-md p-2 text-left bg-white/20 hover:bg-white/30 border',
          selected ? 'border-white ring-2 ring-white/70' : 'border-white/30'
        )}
        aria-pressed={selected}
        aria-label={`Select ${label} peanut`}
      >
        <canvas
          ref={ref}
          width={64}
          height={48}
          className="rounded bg-white/40"
        />
        <div className="flex-1">
          <div className="font-semibold leading-tight">{label}</div>
          <div className="text-xs opacity-80">{desc}</div>
        </div>
      </button>
    )
  }
}
