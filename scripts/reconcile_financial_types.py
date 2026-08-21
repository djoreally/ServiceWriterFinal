from pathlib import Path
import re

path = Path('/home/ubuntu/ServiceWriterFinal/src/integrations/supabase/types.ts')
text = path.read_text()

invoice_block = '''      invoices: {
        Row: {
          id: string
          workspace_id: string
          customer_id: string
          vehicle_id: string | null
          work_order_id: string | null
          status: string
          invoice_number: number
          subtotal: number
          tax_total: number
          total: number
          amount_paid: number
          due_at: string | null
          issued_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          customer_id: string
          vehicle_id?: string | null
          work_order_id?: string | null
          status?: string
          invoice_number: number
          subtotal?: number
          tax_total?: number
          total?: number
          amount_paid?: number
          due_at?: string | null
          issued_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          customer_id?: string
          vehicle_id?: string | null
          work_order_id?: string | null
          status?: string
          invoice_number?: number
          subtotal?: number
          tax_total?: number
          total?: number
          amount_paid?: number
          due_at?: string | null
          issued_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
'''

payments_block = '''      payments: {
        Row: {
          id: string
          workspace_id: string
          invoice_id: string | null
          customer_id: string | null
          provider: string | null
          provider_payment_id: string | null
          status: string
          amount: number
          currency_code: string
          paid_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          workspace_id: string
          invoice_id?: string | null
          customer_id?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          status?: string
          amount: number
          currency_code?: string
          paid_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          workspace_id?: string
          invoice_id?: string | null
          customer_id?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          status?: string
          amount?: number
          currency_code?: string
          paid_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
'''

for name, block in [
    ('invoices', invoice_block),
    ('payment_records', payments_block),
]:
    pattern = r'^      ' + name + r': \{.*?(?=^      [A-Za-z_][A-Za-z0-9_]*: \{)'
    text, count = re.subn(pattern, block, text, count=1, flags=re.M | re.S)
    if count != 1:
        raise SystemExit(f'Expected exactly one generated type block for {name}, found {count}')

text = text.replace('"payment_records"', '"payments"')
text = text.replace('payment_records_', 'payments_')
text = text.replace('to: "payment_records"', 'to: "payments"')
path.write_text(text)
print('updated', path)
