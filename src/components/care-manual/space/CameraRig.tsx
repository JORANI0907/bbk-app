'use client'

/**
 * 3D 카메라 보조 (2026-11-08) — <Canvas> 안에서만 쓴다. OrbitControls(makeDefault) 와 함께 동작.
 *   KeyboardFly : 방향키/WASD 로 앞뒤·좌우, PageUp/PageDown(또는 Q/E) 로 위아래, Shift 로 3배 빠르게.
 *                 캔버스를 한 번 클릭해 초점을 준 뒤에만 동작 (페이지 스크롤과 충돌 방지).
 *   FlyTo       : 목표 지점이 바뀌면 0.6초 동안 부드럽게 카메라와 회전 중심을 옮긴다 (구역 선택 → 그 방으로 다가가기).
 */

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3 } from 'three'

interface OrbitLike { target: Vector3; update: () => void }
const UP = new Vector3(0, 1, 0)
const MOVE_SPEED = 7
const FAST_MULTIPLIER = 3

const KEYS: Record<string, [number, number, number]> = {
  ArrowUp: [0, 0, 1], KeyW: [0, 0, 1],
  ArrowDown: [0, 0, -1], KeyS: [0, 0, -1],
  ArrowLeft: [-1, 0, 0], KeyA: [-1, 0, 0],
  ArrowRight: [1, 0, 0], KeyD: [1, 0, 0],
  PageUp: [0, 1, 0], KeyE: [0, 1, 0],
  PageDown: [0, -1, 0], KeyQ: [0, -1, 0],
}

export function KeyboardFly() {
  const controls = useThree(s => s.controls) as unknown as OrbitLike | null
  const gl = useThree(s => s.gl)
  const invalidate = useThree(s => s.invalidate)
  const pressed = useRef(new Set<string>())
  const shift = useRef(false)

  useEffect(() => {
    // 키 입력은 tabIndex 가 있는 Canvas 바깥 div 가 받는다 (canvas 바로 위 div 는 초점을 못 받음)
    const el = gl.domElement.closest<HTMLElement>('[tabindex]') ?? gl.domElement.parentElement
    if (!el) return
    const down = (e: KeyboardEvent) => {
      if (!(e.code in KEYS)) return
      e.preventDefault()
      pressed.current.add(e.code)
      shift.current = e.shiftKey
      invalidate()
    }
    const up = (e: KeyboardEvent) => { pressed.current.delete(e.code); shift.current = e.shiftKey }
    const blur = () => pressed.current.clear()
    el.addEventListener('keydown', down)
    el.addEventListener('keyup', up)
    el.addEventListener('blur', blur)
    return () => { el.removeEventListener('keydown', down); el.removeEventListener('keyup', up); el.removeEventListener('blur', blur) }
  }, [gl, invalidate])

  useFrame((state, dt) => {
    if (pressed.current.size === 0 || !controls) return
    const forward = new Vector3()
    state.camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1)
    forward.normalize()
    const right = new Vector3().crossVectors(forward, UP).normalize()
    const move = new Vector3()
    pressed.current.forEach(code => {
      const [x, y, z] = KEYS[code]
      move.addScaledVector(right, x).addScaledVector(UP, y).addScaledVector(forward, z)
    })
    if (move.lengthSq() === 0) return
    move.normalize().multiplyScalar(MOVE_SPEED * (shift.current ? FAST_MULTIPLIER : 1) * Math.min(dt, 0.05))
    state.camera.position.add(move)
    controls.target.add(move)
    controls.update()
    invalidate()
  })
  return null
}

interface FlyToProps {
  /** 다가갈 지점 (world). null 이면 아무것도 안 함 */
  target: [number, number, number] | null
  /** 같은 지점을 다시 눌러도 다가가도록 바꿔 주는 키 */
  nonce: number
}

export function FlyTo({ target, nonce }: FlyToProps) {
  const controls = useThree(s => s.controls) as unknown as OrbitLike | null
  const invalidate = useThree(s => s.invalidate)
  const anim = useRef<{ t: number; fromT: Vector3; toT: Vector3; fromC: Vector3; toC: Vector3 } | null>(null)
  /** 마지막으로 처리한 목표 키. null 이면 아직 controls 가 준비되기 전 */
  const prevKey = useRef<string | null>(null)

  useEffect(() => {
    if (!controls) return
    const key = target ? `${target.join(',')}#${nonce}` : ''
    // controls 가 준비된 첫 순간엔 건물 전체가 보이게 두고, 그 뒤 "구역을 누른" 변화에만 다가간다
    if (prevKey.current === null) { prevKey.current = key; return }
    if (key === prevKey.current || !target) return
    prevKey.current = key
    const toT = new Vector3(...target)
    const camera = (controls as unknown as { object?: { position: Vector3 } }).object?.position
    if (!camera) return
    const offset = camera.clone().sub(controls.target)
    const dist = Math.min(14, Math.max(5, offset.length() * 0.55))
    const toC = toT.clone().add(offset.normalize().multiplyScalar(dist))
    anim.current = { t: 0, fromT: controls.target.clone(), toT, fromC: camera.clone(), toC }
    invalidate()
  }, [target, nonce, controls, invalidate])

  useFrame((state, dt) => {
    const a = anim.current
    if (!a || !controls) return
    a.t = Math.min(1, a.t + dt / 0.6)
    const k = 1 - Math.pow(1 - a.t, 3)
    controls.target.lerpVectors(a.fromT, a.toT, k)
    state.camera.position.lerpVectors(a.fromC, a.toC, k)
    controls.update()
    invalidate()
    if (a.t >= 1) anim.current = null
  })
  return null
}
