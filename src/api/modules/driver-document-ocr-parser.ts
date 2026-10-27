import type {
  DriverDocumentImageSide,
  DriverDocumentOcrResult
} from '@tms/api/modules/driver-document-ocr'

const labels = [
  '姓名',
  '身份证号',
  '公民身份号码',
  '性别',
  '民族',
  '出生日期',
  '出生',
  '住址',
  '地址',
  '签发机关',
  '发证机关',
  '有效期限',
  '有效期',
  '档案编号',
  '准驾车型',
  '准驾类型',
  '资格证类型',
  '从业资格证类型',
  '资格证号'
]
const fieldBoundary = new RegExp(`(?:${labels.join('|')}):`)
const datePattern = /\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/g

function linesFromOcr(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\s+/g, '')
        .replace(/[：﹕]/g, ':')
        .trim()
    )
    .filter(Boolean)
}

function labeledValue(lines: string[], ...candidates: string[]): string | null {
  for (const candidate of candidates) {
    const marker = `${candidate}:`
    const line = lines.find((item) => item.includes(marker))
    if (!line) continue
    const after = line.slice(line.indexOf(marker) + marker.length)
    const boundary = after.search(fieldBoundary)
    const value = (boundary < 0 ? after : after.slice(0, boundary)).trim()
    if (value) return value
  }
  return null
}

function normalizeDate(value: string | null, last = false): string | null {
  const matches = value?.match(datePattern) ?? []
  const source = last ? matches.at(-1) : matches[0]
  if (!source) return null
  const groups = source.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/)
  if (!groups) return null
  const normalized = `${groups[1]}-${groups[2].padStart(2, '0')}-${groups[3].padStart(2, '0')}`
  const parsed = new Date(`${normalized}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : null
}

export function parseLocalDriverDocumentOcr(
  rawText: string,
  side: DriverDocumentImageSide,
  confidence: number
): DriverDocumentOcrResult {
  const lines = linesFromOcr(rawText)
  const document: DriverDocumentOcrResult['document'] = {}
  const identity = side === 'idCardFrontUrl' || side === 'idCardBackUrl'
  const license = side.startsWith('driverLicense') || side === 'licenseBackExtraUrl'
  const qualification = side.startsWith('qualification')

  if (identity) {
    document.driverName = labeledValue(lines, '姓名')
    document.idCardNo =
      labeledValue(lines, '身份证号', '公民身份号码')?.match(/\d{17}[\dXx]/)?.[0] ?? null
    document.gender = labeledValue(lines, '性别')
    document.ethnicity = labeledValue(lines, '民族')
    document.birthDate = normalizeDate(labeledValue(lines, '出生日期', '出生'))
    document.homeAddress = labeledValue(lines, '住址', '地址')
    document.idCardIssuer = labeledValue(lines, '签发机关', '发证机关')
    const validPeriod = labeledValue(lines, '有效期限', '有效期')
    document.idCardValidFrom =
      (validPeriod?.match(datePattern)?.length ?? 0) >= 2 ? normalizeDate(validPeriod) : null
    document.idCardValidTo = normalizeDate(validPeriod, true)
  }
  if (license) {
    document.licenseArchiveNo = labeledValue(lines, '档案编号')
    const classes = labeledValue(lines, '准驾车型', '准驾类型')
    document.licenseClasses = classes?.match(/A1A2|A2E|A2D|A2|B2|A1/g) ?? []
    document.licenseIssuer = labeledValue(lines, '发证机关', '签发机关')
    const validPeriod = labeledValue(lines, '有效期限', '有效期')
    document.licenseValidFrom =
      (validPeriod?.match(datePattern)?.length ?? 0) >= 2 ? normalizeDate(validPeriod) : null
    document.licenseExpireDate = normalizeDate(validPeriod, true)
  }
  if (qualification) {
    document.qualificationType = labeledValue(lines, '从业资格证类型', '资格证类型')
    document.qualificationNo = labeledValue(lines, '资格证号')
    document.qualificationValidTo = normalizeDate(labeledValue(lines, '有效期限', '有效期'), true)
  }
  const recognized = Object.entries(document).filter(([, value]) =>
    typeof value === 'string' ? Boolean(value) : Array.isArray(value) && value.length > 0
  )
  return {
    rawText,
    summary: recognized.length
      ? `本地离线识别提取了 ${recognized.length} 项，请逐项核对。`
      : '已读取图片文字，但没有可靠匹配到表单字段。',
    confidence,
    fieldConfidence: {},
    missingFields: [],
    warnings: ['本地识别不验证证件真伪或认证状态；请对照原件核对。'],
    document
  }
}
