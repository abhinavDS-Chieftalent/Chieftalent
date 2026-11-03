import { useEffect, useRef } from 'react'

/**
 * ShaderGradient - a lightweight WebGL animated gradient (shadergradient.co
 * look) with zero dependencies. Full-screen quad + fbm noise fragment shader.
 * Colors default to the DotStark palette: near-black, brand orange, warm cream.
 *
 * Props: className, colors ([[r,g,b], ...] 0-1 floats), speed, opacity
 */
const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform float u_speed;

// hash + noise + fbm
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(in vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 q = uv * vec2(u_res.x / u_res.y, 1.0);
  float t = u_time * u_speed;

  // domain-warped fbm - slow molten flow
  vec2 w1 = vec2(fbm(q * 1.6 + vec2(t * 0.10, t * 0.06)),
                 fbm(q * 1.6 + vec2(-t * 0.07, t * 0.09)));
  vec2 w2 = vec2(fbm(q * 2.2 + 3.0 * w1 + vec2(t * 0.05, -t * 0.04)),
                 fbm(q * 2.2 + 3.0 * w1 + vec2(-t * 0.06, t * 0.03)));
  float f = fbm(q * 1.8 + 2.6 * w2);

  // vertical bias: glow pools toward the top like a light source
  float pool = smoothstep(1.15, 0.15, uv.y);
  float v = clamp(f * 0.75 + pool * 0.45, 0.0, 1.0);

  vec3 col = mix(u_c1, u_c2, smoothstep(0.25, 0.75, v));
  col = mix(col, u_c3, smoothstep(0.72, 1.0, v) * 0.85);

  // vignette so edges stay dark
  float vig = smoothstep(1.25, 0.35, length(uv - vec2(0.5, 0.42)));
  col *= mix(0.55, 1.0, vig);

  gl_FragColor = vec4(col, 1.0);
}
`

function hexToRgb01(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export default function ShaderGradient({
  className = '',
  colors = ['#0a0a0a', '#ee5a2e', '#ffc9a8'],
  speed = 0.5,
  style,
}) {
  const canvasRef = useRef(null)
  const rafRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
    if (!gl) return // graceful fallback: element keeps its CSS background

    const compile = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('shader:', gl.getShaderInfoLog(s))
        return null
      }
      return s
    }
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return

    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uSpeed = gl.getUniformLocation(prog, 'u_speed')
    const uC1 = gl.getUniformLocation(prog, 'u_c1')
    const uC2 = gl.getUniformLocation(prog, 'u_c2')
    const uC3 = gl.getUniformLocation(prog, 'u_c3')

    const [c1, c2, c3] = colors.map(hexToRgb01)
    gl.uniform3fv(uC1, c1)
    gl.uniform3fv(uC2, c2)
    gl.uniform3fv(uC3, c3)
    gl.uniform1f(uSpeed, speed)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = canvas
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uRes, canvas.width, canvas.height)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const t0 = performance.now()
    const frame = () => {
      gl.uniform1f(uTime, (performance.now() - t0) / 1000)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (!reduced) rafRef.current = requestAnimationFrame(frame)
    }
    frame() // reduced-motion users get one static frame

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [colors, speed])

  return <canvas ref={canvasRef} className={`shader-canvas ${className}`} style={style} aria-hidden="true" />
}
