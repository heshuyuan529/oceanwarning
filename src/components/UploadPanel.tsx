/**
 * 订单文件上传面板（W1 工作台弹窗）
 *
 * 用户拖拽或选择 Excel/CSV 后：
 *   1. 选 horizon（7天 / 3天 / 1天，默认 7天）
 *   2. 上传到后端 /api/predict/upload
 *   3. 把返回的 PredictResponse 数组按 horizon 通过 onResult 回调合并到工作台
 *
 * 列名规则详见 src/api/predict.ts uploadAndPredict 注释：
 *   - 中文列名（与 pipeline.py 一致）：节点13_ETD / 箱型 / 始发港 / 目的港 / 出口国家 /
 *     成交方式 / 预计生产日期 / 实际生产日期 / 实际预付款日期 / 节点1_录单_采购日期(Proxy) /
 *     节点4_发起订舱时间 ... 节点12_放行时间
 *   - 或英文 API 键：etd / container_type / origin / destination / country / trade_type /
 *     planned_production_date / planned_payment_date / actual_production_date /
 *     actual_payment_date / procurement_date / booking ... release
 *   - ETD 列必填
 */

import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X, Loader2, AlertCircle, Download } from 'lucide-react'
import { uploadAndPredict, ApiError } from '../api/predict'
import type { PredictResponse } from '../api/predict'
import type { Horizon } from '../types'

interface UploadPanelProps {
  /** 上传成功后回调：horizon + 与表格行序对齐的 PredictResponse 数组 */
  onResult: (horizon: Horizon, responses: PredictResponse[], file: File) => void
  /** 关闭面板 */
  onClose: () => void
}

const HORIZONS: Horizon[] = ['7天', '3天', '1天']

// 上传示例模板（CSV 文本，用户可下载参考列名）
const TEMPLATE_CSV = `节点13_ETD,箱型,始发港,目的港,出口国家,成交方式,预计生产日期,预计预付款日期,实际生产日期,实际预付款日期,节点1_录单_采购日期(Proxy)
2026-10-15,40HQ,青岛,鹿特丹,NL,FOB,2026-09-30,2026-09-25,,2026-09-22,2026-09-10
2026-10-20,40GP,上海,汉堡,DE,CIF,2026-10-05,2026-10-10,,,2026-09-15
`

export function UploadPanel({ onResult, onClose }: UploadPanelProps) {
  const [horizon, setHorizon] = useState<Horizon>('7天')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File | null) {
    setError(null)
    if (!f) return
    const name = f.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      setError('仅支持 .xlsx / .xls / .csv 文件')
      return
    }
    setFile(f)
  }

  async function handleUpload() {
    if (!file) {
      setError('请先选择文件')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const resp = await uploadAndPredict(horizon, file, {
        standalone: true,
        interventions: false,
      })
      onResult(horizon, resp, file)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message
      setError(`上传失败：${msg}`)
    } finally {
      setLoading(false)
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '订单上传模板.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="up-overlay" onClick={onClose}>
      <div className="up-panel" onClick={e => e.stopPropagation()}>
        <div className="up-head">
          <h3><Upload size={16} /> 上传订单文件</h3>
          <button className="up-close" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="up-body">
          {/* 提前期选择 */}
          <div className="up-field">
            <label>提前期 horizon</label>
            <div className="up-horizons">
              {HORIZONS.map(h => (
                <button
                  key={h}
                  className={horizon === h ? 'selected' : ''}
                  onClick={() => setHorizon(h)}
                  disabled={loading}
                >
                  {h}
                </button>
              ))}
            </div>
            <small>不同提前期使用不同 LightGBM 模型；混在一张表的订单按此 horizon 统一推理</small>
          </div>

          {/* 文件拖拽区 */}
          <div
            className={`up-dropzone ${dragOver ? 'drag' : ''} ${file ? 'has-file' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault()
              setDragOver(false)
              pickFile(e.dataTransfer.files[0])
            }}
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => pickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <div className="up-file-info">
                <FileSpreadsheet size={28} />
                <div>
                  <b>{file.name}</b>
                  <small>{(file.size / 1024).toFixed(1)} KB</small>
                </div>
              </div>
            ) : (
              <div className="up-drop-hint">
                <Upload size={28} />
                <b>拖拽文件到此处，或点击选择</b>
                <small>支持 .xlsx / .xls / .csv</small>
              </div>
            )}
          </div>

          {/* 模板下载 */}
          <button className="up-template" onClick={downloadTemplate} disabled={loading}>
            <Download size={13} /> 下载列名模板（CSV）
          </button>

          {/* 错误展示 */}
          {error && (
            <div className="up-error">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="up-foot">
          <button className="button ghost" onClick={onClose} disabled={loading}>
            取消
          </button>
          <button
            className="button primary"
            onClick={handleUpload}
            disabled={loading || !file}
          >
            {loading ? <><Loader2 size={14} className="spin" /> 推理中…</> : <>上传并推理</>}
          </button>
        </div>
      </div>
    </div>
  )
}
