/**
 * 风险预警后端 API 客户端
 *
 * 对接 backend/app/main.py 的 FastAPI：
 *   POST /api/predict  — 批量订单 → p_raw → 融合推断 → p*
 *   GET  /api/health   — 健康检查
 *
 * 后端返回字段为 snake_case（如 p_raw、bin_id），与前端 bn/engine.ts 的
 * camelCase（如 pRaw、binId）不同。本模块负责：
 *   1. 定义与后端 schemas.py 对齐的请求/响应类型
 *   2. 提供 predictBatch / healthCheck 封装
 *   3. 提供 toScoreTrace 适配器，把后端 snake_case 响应转为前端 ScoreTrace
 */

import type { FusionMethod, Horizon, JointState, MilestoneState } from '../types'
import type { ScoreTrace } from '../bn/engine'

// ===== 后端请求类型（与 schemas.py 对齐）=====

export interface OrderInput {
  etd: string
  container_type?: string
  origin?: string
  destination?: string
  country?: string
  trade_type?: string
  planned_production_date?: string | null
  planned_payment_date?: string | null
  actual_production_date?: string | null
  actual_payment_date?: string | null
  procurement_date?: string | null
  /** SIM 节点（9 个） */
  booking?: string | null
  allocation?: string | null
  so?: string | null
  documents?: string | null
  pickup?: string | null
  return?: string | null
  customs?: string | null
  gate?: string | null
  release?: string | null
}

export interface PredictRequest {
  horizon: Horizon
  orders: OrderInput[]
  options?: {
    standalone?: boolean
    interventions?: boolean
  }
}

// ===== 后端响应类型（snake_case）=====

export interface ApiScoreTrace {
  horizon: Horizon
  method: FusionMethod
  method_label: string
  p_raw: number
  q: number
  bin_id: string
  bin_label: string
  state_id: string
  state_label: string
  is_other_state: boolean
  pi: [number, number]
  lambda: [number, number]
  theta: [number, number]
  LR: number
  r: number
  p_star: number
  versions: {
    mlModel: string
    conditionTable: string
    virtualEvidence: string
  }
}

export interface ApiJointState {
  production: MilestoneState
  payment: MilestoneState
}

export interface ApiIntervention {
  alternative: ApiJointState
  baseline: ApiScoreTrace
  intervened: ApiScoreTrace
  r_change: number
  p_star_change: number
}

export interface PredictResponse {
  /** 上传订单的原始字段（后端回带，供前端展示港对/箱型等） */
  order?: OrderInput
  p_raw: number
  joint_state: ApiJointState
  score: ApiScoreTrace
  standalone?: { q: number; p_star: number }
  interventions?: ApiIntervention[]
}

// ===== API 配置 =====

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''
const PREDICT_URL = `${API_BASE}/api/predict`
const HEALTH_URL = `${API_BASE}/api/health`

// ===== 类型适配（snake_case → camelCase ScoreTrace）=====

/** 把后端 ApiScoreTrace 转为前端 bn/engine.ts 的 ScoreTrace。 */
export function toScoreTrace(api: ApiScoreTrace): ScoreTrace {
  return {
    horizon: api.horizon,
    method: api.method,
    methodLabel: api.method_label,
    pRaw: api.p_raw,
    q: api.q,
    binId: api.bin_id,
    binLabel: api.bin_label,
    stateId: api.state_id,
    stateLabel: api.state_label,
    isOtherState: api.is_other_state,
    pi: api.pi,
    lambda: api.lambda,
    theta: api.theta,
    LR: api.LR,
    r: api.r,
    pStar: api.p_star,
    versions: api.versions,
  }
}

/** 把后端 ApiJointState 转为前端 JointState。 */
export function toJointState(api: ApiJointState): JointState {
  return { production: api.production, payment: api.payment }
}

// ===== 网络封装 =====

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new ApiError(
      `无法连接到后端：${url}（请确认 VITE_API_BASE 与后端服务状态）`,
      0,
      e,
    )
  }
  if (!resp.ok) {
    let detail: unknown
    let message = `HTTP ${resp.status}`
    try {
      detail = await resp.json()
      const d = (detail as { detail?: unknown })?.detail
      if (typeof d === 'string') message = d
      else if (Array.isArray(d)) message = (d[0] as { msg?: string })?.msg ?? message
    } catch {
      // 忽略解析错误
    }
    throw new ApiError(message, resp.status, detail)
  }
  return (await resp.json()) as T
}

/**
 * 批量预测：把订单数据发给后端，由 LightGBM 推理 p_raw 并完成融合推断。
 *
 * @returns 与 orders 等长、按序对齐的 PredictResponse 数组
 */
export async function predictBatch(
  horizon: Horizon,
  orders: OrderInput[],
  options?: { standalone?: boolean; interventions?: boolean },
): Promise<PredictResponse[]> {
  const req: PredictRequest = { horizon, orders, options: options ?? {} }
  return postJSON<PredictResponse[]>(PREDICT_URL, req)
}

/**
 * 上传 Excel/CSV 文件并推理。
 *
 * 表格列名支持中文（与 pipeline.py 一致）或英文 API 键。
 * ETD 列必填（中文列名 '节点13_ETD' 或英文 'etd'）。
 *
 * @returns 与表格行数等长、按序对齐的 PredictResponse 数组
 */
export async function uploadAndPredict(
  horizon: Horizon,
  file: File,
  options?: { standalone?: boolean; interventions?: boolean },
): Promise<PredictResponse[]> {
  const form = new FormData()
  form.append('horizon', horizon)
  form.append('file', file)
  form.append('standalone', String(options?.standalone ?? true))
  form.append('interventions', String(options?.interventions ?? false))

  let resp: Response
  try {
    resp = await fetch(`${API_BASE}/api/predict/upload`, {
      method: 'POST',
      body: form,
    })
  } catch (e) {
    throw new ApiError(
      `无法连接到后端上传端点（请确认 VITE_API_BASE 与后端服务状态）`,
      0,
      e,
    )
  }
  if (!resp.ok) {
    let detail: unknown
    let message = `HTTP ${resp.status}`
    try {
      detail = await resp.json()
      const d = (detail as { detail?: unknown })?.detail
      if (typeof d === 'string') message = d
    } catch {
      // 忽略
    }
    throw new ApiError(message, resp.status, detail)
  }
  return (await resp.json()) as PredictResponse[]
}

/** 健康检查：返回后端状态与已加载模型数。 */
export async function healthCheck(): Promise<{ status: string; models_loaded: number }> {
  const resp = await fetch(HEALTH_URL)
  if (!resp.ok) throw new ApiError(`HTTP ${resp.status}`, resp.status)
  return (await resp.json()) as { status: string; models_loaded: number }
}
