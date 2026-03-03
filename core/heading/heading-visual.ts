import { HeadingSample } from '../types/heading'

export function drawHeadingCompass(
  ctx: any,
  heading: HeadingSample,
  canvasSize: number = 300
) {
  const center = canvasSize / 2
  const radius = 110

  const angle = heading.headingRad
  const yawRate = heading.yawRate

  ctx.clearRect(0, 0, canvasSize, canvasSize)

  // ==============================
  // 1️⃣ 画外圆
  // ==============================
  ctx.beginPath()
  ctx.arc(center, center, radius, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(30,30,40,0.9)'
  ctx.fill()
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 2
  ctx.stroke()

  // ==============================
  // 2️⃣ 北方向
  // ==============================
  ctx.beginPath()
  ctx.moveTo(center, center - radius)
  ctx.lineTo(center, center - radius + 20)
  ctx.strokeStyle = '#f44'
  ctx.lineWidth = 4
  ctx.stroke()

  ctx.font = '14px monospace'
  ctx.fillStyle = '#f44'
  ctx.fillText('N', center - 6, center - radius - 8)

  // ==============================
  // 3️⃣ 画刻度线
  // ==============================
  for (let i = 0; i < 360; i += 30) {
    const rad = (i * Math.PI) / 180
    const x1 = center + Math.sin(rad) * (radius - 10)
    const y1 = center - Math.cos(rad) * (radius - 10)
    const x2 = center + Math.sin(rad) * radius
    const y2 = center - Math.cos(rad) * radius

    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.strokeStyle = '#555'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // ==============================
  // 4️⃣ 画当前 heading 箭头
  // ==============================
  const arrowLength = radius - 20

  const arrowX = center + Math.sin(angle) * arrowLength
  const arrowY = center - Math.cos(angle) * arrowLength

  // 根据转向改变颜色
  let color = '#0f0'
  if (yawRate > 0.05) color = '#4af'    // 左转
  if (yawRate < -0.05) color = '#fa4'   // 右转

  ctx.beginPath()
  ctx.moveTo(center, center)
  ctx.lineTo(arrowX, arrowY)
  ctx.strokeStyle = color
  ctx.lineWidth = 6
  ctx.stroke()

  // 箭头头
  const headSize = 12
  const baseAngle = Math.atan2(arrowY - center, arrowX - center)

  ctx.beginPath()
  ctx.moveTo(arrowX, arrowY)
  ctx.lineTo(
    arrowX - headSize * Math.cos(baseAngle - 0.3),
    arrowY - headSize * Math.sin(baseAngle - 0.3)
  )
  ctx.lineTo(
    arrowX - headSize * Math.cos(baseAngle + 0.3),
    arrowY - headSize * Math.sin(baseAngle + 0.3)
  )
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()

  // ==============================
  // 5️⃣ 显示角度
  // ==============================
  ctx.font = '16px monospace'
  ctx.fillStyle = '#fff'
  ctx.fillText(
    `Heading: ${heading.headingDeg.toFixed(1)}°`,
    20,
    25
  )

  ctx.fillText(
    `YawRate: ${yawRate.toFixed(3)}`,
    20,
    45
  )
}