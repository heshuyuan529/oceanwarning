// AI 复盘中心演示数据（自 main.tsx 原样迁出，内容未改动）
import { Activity, Anchor, FileSearch, Scale, Ship, UsersRound } from 'lucide-react'

export const events = [
  { group: '订单下达', name: '录单', plan: '7月01日 09:00', actual: '7月01日 09:12', delay: 0, type: '正常', source: '订单系统' },
  { group: '订单下达', name: '工厂排产', plan: '7月03日 18:00', actual: '7月03日 17:40', delay: 0, type: '正常', source: '工厂MES' },
  { group: '物流订舱', name: '发起订舱', plan: '7月04日 10:00', actual: '7月04日 10:05', delay: 0, type: '正常', source: '订舱平台' },
  { group: '物流订舱', name: 'Booking确认', plan: '7月05日 18:00', actual: '7月06日 11:20', delay: 0.7, type: '原生延误', source: '船司EDI' },
  { group: '拖车背箱', name: '工厂备货', plan: '7月08日 18:00', actual: '7月15日 17:52', delay: 7, type: '原生延误', source: '工厂MES' },
  { group: '拖车背箱', name: '提箱', plan: '7月09日 14:00', actual: '7月16日 10:18', delay: 6.8, type: '传导延误', source: '拖车TMS' },
  { group: '报关集港', name: '报关放行', plan: '7月10日 16:00', actual: '7月17日 14:35', delay: 6.9, type: '传导延误', source: '关务系统' },
  { group: '报关集港', name: '码头放行', plan: '7月11日 18:00', actual: '7月18日 13:10', delay: 6.8, type: '传导延误', source: '码头系统' },
  { group: '离港出运', name: '装船发运', plan: '7月12日 20:00', actual: '7月25日 22:30', delay: 13.1, type: '原生延误', source: 'AIS + 船司' },
  { group: '离港出运', name: '到港清关', plan: '8月02日 08:00', actual: '8月17日 09:25', delay: 15, type: '传导延误', source: '海外代理' },
]

export const agents = [
  { name: '数据观测代理', role: '数据专员', icon: Activity, summary: '已统一10个关键事件，识别2个原生异常、4个传导节点。', confidence: '数据完整度 92%', evidence: 18 },
  { name: '物流专家', role: '物流 / 货代', icon: Ship, summary: '工厂备货晚7天是首个主要原生异常，直接压缩截港窗口。', confidence: '置信度 91%', evidence: 6 },
  { name: '船司专家', role: '船司对接', icon: Anchor, summary: '改船及晚开新增约6.1天；历史表现提示偶发扰动，合同责任待核。', confidence: '置信度 76%', evidence: 5 },
  { name: '港口关务专家', role: '关务 / 海外代理', icon: FileSearch, summary: '目的港拥堵贡献约2天净新增影响，另有2天与上游延误重叠。', confidence: '置信度 84%', evidence: 4 },
  { name: '法务专家', role: '法务商务', icon: Scale, summary: 'FOB不等于工厂承担全部运输责任；船司SLA条款版本仍需补证。', confidence: '置信度 72%', evidence: 3 },
  { name: '主持代理', role: '复盘主持', icon: UsersRound, summary: '已消解重复计时并生成责任建议，最终结论需业务负责人签发。', confidence: '综合可信度 82%', evidence: 21 },
]

export const responsibility = [
  { name: '工厂', pct: 47, days: '7.0天', color: '#ef8354', reason: '备货延误为首个原生异常' },
  { name: '船司', pct: 33, days: '4.9天', color: '#4f7cac', reason: '改船及晚开形成净新增延误' },
  { name: '港口关务', pct: 13, days: '2.0天', color: '#7e9f77', reason: '拥堵与清关作业影响' },
  { name: '日日顺', pct: 7, days: '1.1天', color: '#a7a9be', reason: '协同升级仍有改进空间' },
]
