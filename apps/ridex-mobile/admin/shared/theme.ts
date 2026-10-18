/** 
 * RideX Admin Mobile visual tokens. 
 * Brand red is reserved for primary actions and high-attention states; 
 * operational green remains semantic for healthy/online/approved states. 
 */ 
export const ADMIN_THEME = { 
  background: '#F8FAFC', 
  surface: '#FFFFFF', 
  text: '#0F172A', 
  muted: '#64748B', 
  border: '#E5E7EB', 
  primary: '#E11D48', 
  primaryDark: '#BE123C', 
  primarySoft: '#FFF1F2', 
  green: '#10B981', 
  greenDark: '#059669', 
  greenSoft: '#ECFDF3', 
  red: '#E11D48', 
  redSoft: '#FFF1F2', 
  yellow: '#F59E0B', 
  blue: '#3B82F6', 
  navy: '#0F172A', 
  shadow: 'rgba(15, 23, 42, 0.06)', 
}; 
 
export type AdminIconName = 
  | 'dashboard' | 'live' | 'customers' | 'drivers' | 'vehicle' | 'kyc' | 'bookings' 
  | 'finance' | 'payments' | 'matching' | 'events' | 'promotions' | 'pricing' | 'zones' 
  | 'route' | 'reports' | 'safety' | 'sos' | 'notifications' | 'support' | 'admins' 
  | 'roles' | 'audit' | 'settings' | 'platform' | 'test-data' | 'back' | 'refresh' | 'search' | 'check' | 'chevron_right';
