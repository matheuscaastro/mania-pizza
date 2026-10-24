export type Role = 'admin' | 'caixa' | 'garcom' | 'entregador' | 'cozinha';
export type OrderType = 'mesa' | 'balcao' | 'entrega';
export type OrderStatus = 'novo' | 'em_preparo' | 'pronto' | 'em_rota' | 'entregue' | 'cancelado';
export type PayMethod = 'dinheiro' | 'debito' | 'credito' | 'pix';
export type TableStatus = 'livre' | 'ocupada' | 'aguardando_conta' | 'reservada';
export type Size = 'G' | 'GG';

export interface User {
  id: number;
  name: string;
  role: Role;
  username?: string;
  deliverer_type?: 'funcionario' | 'autonomo' | null;
  active?: boolean;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price_g: number;
  price_gg: number | null;
  allows_half: boolean;
  active: boolean;
}
export interface Category {
  id: number;
  name: string;
  kind: 'pizza' | 'simples';
  sort: number;
  active: boolean;
  products: Product[];
}

export interface OrderItem {
  id: number;
  product_id: number;
  name: string;
  size: Size | null;
  half_product_id: number | null;
  half_name: string | null;
  qty: number;
  unit_price: number;
  notes: string | null;
}
export interface Order {
  id: number;
  number: number;
  type: OrderType;
  status: OrderStatus;
  account_id: number;
  table_id: number | null;
  table_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  neighborhood_name: string | null;
  delivery_fee: number;
  deliverer_id: number | null;
  deliverer_name: string | null;
  deliverer_type: string | null;
  pay_on_delivery_method: PayMethod | null;
  change_for: number | null;
  notes: string | null;
  cancel_reason: string | null;
  created_by: number | null;
  created_by_name: string | null;
  created_at: string;
  prepared_at: string | null;
  ready_at: string | null;
  out_at: string | null;
  delivered_at: string | null;
  items: OrderItem[];
  items_total: number;
  total: number;
}

export interface Payment {
  id: number;
  method: PayMethod;
  amount: number;
  created_at: string;
}
export interface Account {
  id: number;
  table_id: number | null;
  table_number: number | null;
  people: number | null;
  status: 'aberta' | 'aguardando_conta' | 'paga' | 'cancelada';
  discount: number;
  discount_reason: string | null;
  opened_at: string;
  orders: Order[];
  payments: Payment[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  paid: number;
}

export interface DiningTable {
  id: number;
  number: number;
  capacity: number;
  area: string;
  status: TableStatus;
  reserved_for: string | null;
  reserved_at: string | null;
  account_id: number | null;
  account_status: string | null;
  people: number | null;
  waiter_name: string | null;
  account_opened_at: string | null;
  total: number;
  ready_count: number;
  pending_count: number;
}

export interface Neighborhood {
  id: number;
  name: string;
  fee: number;
  eta_minutes: number;
  active: boolean;
}

export interface CashMovement {
  id: number;
  type: 'sangria' | 'suprimento' | 'despesa';
  amount: number;
  category: string | null;
  note: string | null;
  created_at: string;
  created_by_name: string | null;
}
export interface CashSession {
  id: number;
  opened_at: string;
  closed_at: string | null;
  initial_amount: number;
  opened_by_name: string;
  closed_by_name: string | null;
  counted_cash: number | null;
  expected_cash: number;
  difference: number | null;
  by_method: { method: PayMethod; total: number; n: number }[];
  movements: CashMovement[];
  received: number;
  sangria: number;
  suprimento: number;
  despesa: number;
}
