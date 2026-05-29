import { useEffect } from 'react'
import { useCodeMirror } from '../../hooks/useCodeMirror'
import { formatJson } from '../../utils/jsonUtils'

export default function ResponseBody({ body }) {
  const formatted = formatJson(body) ?? body
  const { ref, setValue } = useCodeMirror({ initialValue: formatted, readOnly: true })

  useEffect(() => {
    setValue(formatJson(body) ?? body ?? '')
  }, [body, setValue])

  return <div ref={ref} className="cm-container cm-readonly" />
}
