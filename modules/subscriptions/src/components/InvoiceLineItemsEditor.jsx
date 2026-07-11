import { formatCurrency } from '@nidus-admin/shared'
import { inputClass } from '@nidus-admin/ui'
import { createEmptyLineItem, recalculateLineItem, sumLineItems } from '../utils/invoiceLineItems.js'

const cellInputClass = `${inputClass} py-1.5 text-sm`

export default function InvoiceLineItemsEditor({
  items = [],
  currency = 'USD',
  onChange,
  readOnly = false,
}) {
  const lineItems = items.length ? items : [createEmptyLineItem()]

  const updateItem = (index, field, value) => {
    if (readOnly || !onChange) return
    onChange(lineItems.map((item, itemIndex) => (
      itemIndex === index ? recalculateLineItem(item, field, value) : item
    )))
  }

  const addRow = () => {
    if (readOnly || !onChange) return
    onChange([...lineItems, createEmptyLineItem()])
  }

  const removeRow = (index) => {
    if (readOnly || !onChange) return
    const next = lineItems.filter((_, itemIndex) => itemIndex !== index)
    onChange(next.length ? next : [createEmptyLineItem()])
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded border border-gray-700">
        <table className="min-w-full text-sm text-gray-200">
          <thead className="bg-gray-800 text-left text-xs uppercase text-gray-400">
            <tr>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 w-24">Qty</th>
              <th className="px-3 py-2 w-32">Unit Price</th>
              <th className="px-3 py-2 w-32">Amount</th>
              {!readOnly && <th className="px-3 py-2 w-16" aria-label="Remove row" />}
            </tr>
          </thead>
          <tbody>
            {lineItems.map((item, index) => (
              <tr key={`${index}-${item.description}`} className="border-t border-gray-800">
                <td className="px-3 py-2">
                  {readOnly ? (
                    <span>{item.description || '—'}</span>
                  ) : (
                    <input
                      type="text"
                      className={cellInputClass}
                      value={item.description}
                      placeholder="Description"
                      onChange={(event) => updateItem(index, 'description', event.target.value)}
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {readOnly ? (
                    <span>{item.quantity}</span>
                  ) : (
                    <input
                      type="number"
                      min={1}
                      step="1"
                      className={cellInputClass}
                      value={item.quantity}
                      onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                    />
                  )}
                </td>
                <td className="px-3 py-2">
                  {readOnly ? (
                    <span>{formatCurrency(item.unit_price, currency)}</span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={cellInputClass}
                      value={item.unit_price}
                      onChange={(event) => updateItem(index, 'unit_price', event.target.value)}
                    />
                  )}
                </td>
                <td className="px-3 py-2 font-medium">
                  {formatCurrency(item.amount, currency)}
                </td>
                {!readOnly && (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeRow(index)}
                      disabled={lineItems.length === 1}
                      className="text-xs text-red-300 hover:text-red-200 disabled:cursor-not-allowed disabled:text-gray-600"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-700 bg-gray-950/60">
            <tr>
              <td colSpan={readOnly ? 3 : 3} className="px-3 py-2 text-right text-xs uppercase tracking-wide text-gray-500">
                Subtotal
              </td>
              <td className="px-3 py-2 font-medium text-gray-100">
                {formatCurrency(sumLineItems(lineItems), currency)}
              </td>
              {!readOnly && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={addRow}
          className="rounded border border-gray-600 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
        >
          Add line item
        </button>
      )}
    </div>
  )
}
