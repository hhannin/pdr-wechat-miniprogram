import { GravitySample } from '../../core/types/gravity'



export function drawGravity3D(
  ctx: any, g: GravitySample, canvasSize: number = 300
): void {
  const center = canvasSize / 2
  const radius = 80  // 球体半径
  
  // 获取重力向量
  const gx = g.gravity.x || 0
  const gy = g.gravity.y || 0
  const gz = g.gravity.z || 0
  
  // 归一化
  const length = Math.sqrt(gx*gx + gy*gy + gz*gz)
  if (length < 0.001) return  // 避免除零
  
  const nx = gx / length
  const ny = gy / length
  const nz = gz / length
  
  ctx.clearRect(0, 0, canvasSize, canvasSize)
  
  // 1. 绘制半透明球体
  const gradient = ctx.createRadialGradient(
    center-15, center-15, 10,
    center, center, radius
  )
  gradient.addColorStop(0, 'rgba(100,100,255,0.8)')
  gradient.addColorStop(0.7, 'rgba(50,50,150,0.6)')
  gradient.addColorStop(1, 'rgba(20,20,80,0.4)')
  
  ctx.beginPath()
  ctx.arc(center, center, radius, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()
  ctx.strokeStyle = '#88f'
  ctx.lineWidth = 1
  ctx.stroke()
  
  // 2. 绘制坐标轴
  // X轴（红）
  ctx.beginPath()
  ctx.moveTo(center, center)
  ctx.lineTo(center + 60, center)
  ctx.strokeStyle = '#f66'
  ctx.lineWidth = 1
  ctx.stroke()
  
  // Y轴（绿）
  ctx.beginPath()
  ctx.moveTo(center, center)
  ctx.lineTo(center, center - 60)
  ctx.strokeStyle = '#6f6'
  ctx.stroke()
  
  // Z轴（用圆圈表示）
  ctx.beginPath()
  ctx.arc(center, center, 20, 0, Math.PI * 2)
  ctx.strokeStyle = '#66f'
  ctx.stroke()
  
  // 3. 绘制重力方向箭头
  const projX = nx * 70
  const projY = ny * 70 - nz * 35
  const arrowEndX = center + projX
  const arrowEndY = center - projY
  
  // 箭头杆
  ctx.beginPath()
  ctx.moveTo(center, center)
  ctx.lineTo(arrowEndX, arrowEndY)
  ctx.strokeStyle = '#ff0'
  ctx.lineWidth = 4
  ctx.stroke()
  
  // 箭头头部
  const angle = Math.atan2(projY, projX)
  const arrowSize = 12
  
  ctx.beginPath()
  ctx.moveTo(arrowEndX, arrowEndY)
  ctx.lineTo(
    arrowEndX - arrowSize * Math.cos(angle - 0.3),
    arrowEndY - arrowSize * Math.sin(angle - 0.3)
  )
  ctx.lineTo(
    arrowEndX - arrowSize * Math.cos(angle + 0.3),
    arrowEndY - arrowSize * Math.sin(angle + 0.3)
  )
  ctx.closePath()
  ctx.fillStyle = '#ff0'
  ctx.fill()
  
  // 4. 显示重力数值
  ctx.font = '12px monospace'
  ctx.fillStyle = '#fff'
  ctx.fillText(`g: (${gx.toFixed(2)}, ${gy.toFixed(2)}, ${gz.toFixed(2)})`, 10, 20)
}