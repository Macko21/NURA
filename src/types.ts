// Tipos de dominio de NURA. Se mantienen en camelCase para reflejar la
// forma con la que trabaja la UI; la capa de datos (db.ts) mapea el esquema
// normalizado (snake_case) a estas formas.

export type Rol = 'admin' | 'vendedor';
export type TipoProducto = 'liquido' | 'accesorio';
export type EstadoVenta = 'pagado' | 'pendiente' | 'cancelado';
export type MedioPago = 'efectivo' | 'transferencia';

export interface Perfil {
  id: string; // = auth.uid()
  username: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export interface SesionUsuario {
  id: string;
  email: string;
  username: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export interface Presentacion {
  id: string;
  nombre: string;
  litros: number;
  costoEnvase: number;
  costoEtiqueta: number;
  ganancia: number;
  descMayorista: number;
  precioVenta: number;
  precioMayorista: number;
}

export interface Producto {
  id: string;
  nombre: string;
  codigo?: string;
  categoria: string;
  tipo: TipoProducto;
  descripcion?: string;
  stockLitros: number;
  stockMinLitros: number;
  costoLitro: number;
  stockUnidades: number;
  stockMinUnidades: number;
  costoUnidad: number;
  gananciaAcc: number;
  descMayorista: number;
  precioVenta: number;
  precioMayorista: number;
  presentaciones: Presentacion[];
}

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  notas: string;
  esMayorista: boolean;
  vendedorId: string | null;
}

export interface VentaItem {
  productoId: string | null;
  presId: string | null;
  comboId: string | null;
  nombre: string;
  detalle: string;
  cantidad: number;
  precio: number;
  precioAplicado: number;
  precioMayorista: number;
  costoUnitario: number;
  litrosPorUnidad: number;
  subtotal: number;
  esAcc: boolean;
  esCombo: boolean;
  key?: string;
  stockDisp?: number;
  comboItems?: ComboItem[];
}

export interface VentaPago {
  id: string;
  fecha: number;
  monto: number;
  medio: MedioPago;
}

export interface Venta {
  id: string;
  fecha: number;
  clienteId: string | null;
  clienteNombre: string;
  vendedorId: string | null;
  vendedorNombre: string;
  esMayorista: boolean;
  subtotal: number;
  descuento: number;
  envio: number;
  total: number;
  estado: EstadoVenta;
  obs: string;
  items: VentaItem[];
  pagos: VentaPago[];
}

export interface Compra {
  id: string;
  fecha: number;
  productoId: string | null;
  productoNombre: string;
  tipo: TipoProducto;
  proveedor: string;
  cantidad: number;
  precioUnit: number;
  total: number;
  notas: string;
}

export interface ComboItem {
  productoId: string | null;
  presId: string | null;
  nombre: string;
  detalle: string;
  cantidad: number;
  precio: number;
  precioMayorista: number;
  litrosPorUnidad: number;
  esAcc: boolean;
  key?: string;
}

export interface Combo {
  id: string;
  nombre: string;
  descripcion: string;
  precio: number;
  precioMayorista: number;
  vendedorId: string | null;
  items: ComboItem[];
}

export interface Store {
  perfiles: Perfil[];
  productos: Producto[];
  clientes: Cliente[];
  ventas: Venta[];
  compras: Compra[];
  combos: Combo[];
}
