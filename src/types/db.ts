export type Currency = 'PHP' | 'USD'
export type ProductType = 'free' | 'premium'
export type OrderStatus = 'awaiting_payment' | 'pending_verification' | 'approved' | 'rejected' | 'cancelled' | 'refunded'

export interface Category { id: string; slug: string; name: string; sort_order: number }

export interface Soundfont {
  id: string; slug: string; name: string; description: string; category_id: string | null
  type: ProductType; price_php: number; price_usd: number; cover_path: string | null; version: string
  preset_count: number | null; sound_count: number | null; velocity_layers: number | null
  channel_mode: 'stereo' | 'mono' | 'mixed' | null
  presets: { bank: number; program: number; name: string }[]
  install_instructions: string; license_text: string
  is_published: boolean; is_featured: boolean
  download_count: number; sales_count: number; rating_avg: number; rating_count: number
  file_size_bytes: number; created_at: string; updated_at: string
  categories?: Pick<Category, 'name' | 'slug'> | null
}

export interface AudioPreview { id: string; soundfont_id: string; title: string; storage_path: string; mime: string; duration_sec: number | null; sort_order: number }
export interface SupportedApp { id: string; slug: string; name: string; platforms: string | null; sort_order: number }
export interface Compatibility { soundfont_id: string; application_id: string; status: 'verified' | 'unverified' | 'incompatible'; tested_version: string | null; notes: string | null; supported_applications?: SupportedApp }
export interface PublicFile { id: string; soundfont_id: string; file_name: string; kind: 'sf2' | 'zip'; size_bytes: number; version: string; created_at: string }

export interface Bundle {
  id: string; slug: string; name: string; description: string; cover_path: string | null
  price_php: number; price_usd: number; is_published: boolean
  bundle_items?: { soundfont_id: string; soundfonts: Soundfont }[]
}

export interface Order {
  id: string; order_number: string; user_id: string; currency: Currency
  subtotal: number; discount_total: number; total: number; status: OrderStatus
  rejection_reason: string | null; created_at: string
  order_items?: { id: string; name_snapshot: string; unit_price: number; soundfont_id: string | null; bundle_id: string | null }[]
  payments?: { id: string; provider: string; reference_number: string; status: string; submitted_at: string; payment_proofs?: { storage_path: string }[] }[]
  profiles?: { email: string; full_name: string | null }
}

export interface PaymentMethod {
  id: string; provider: 'gcash' | 'paypal'; display_name: string; qr_path: string | null
  destination: string | null; account_name: string | null; instructions: string; currency: Currency; is_enabled: boolean
}

export interface Notification { id: string; type: string; title: string; body: string; link: string | null; read_at: string | null; created_at: string }
export interface Review { id: string; user_id: string; soundfont_id: string; rating: number; body: string; created_at: string; profiles?: { full_name: string | null } }
export interface Tutorial { id: string; slug: string; title: string; summary: string; body_md: string; image_path: string | null; video_url: string | null; sort_order: number; is_published: boolean }
