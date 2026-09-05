import mongoose from 'mongoose';

// Bitácora inmutable de cambios en el estado "pagado" de una cuota. No se usa para calcular
// nada (esa sigue siendo Credito.cuotas, vía recalcularCreditoCompleto): es solo para que un
// desarrollador pueda reconstruir, para un cliente puntual, cuándo se marcó cada cuota como
// pagada, cuándo se revirtió, quién lo hizo y desde qué acción, sin depender de que la copia
// embebida en Cliente.creditos[] siga reflejando ese historial.
const registroPagoSchema = new mongoose.Schema({
  clienteId: {
    // String y no ObjectId: Cliente._id es String a propósito (soporta IDs numéricos
    // heredados de clientes previos a la migración, ej. "1765847020493"). Con ObjectId
    // aquí, el insertMany fallaba con BSONError para todo cliente con ID heredado y la
    // bitácora quedaba con un punto ciego total para esos clientes.
    type: String,
    ref: 'Cliente',
    required: true
  },
  clienteNombre: {
    type: String,
    required: true
  },
  documento: {
    type: String
  },
  creditoId: {
    type: String,
    required: true
  },
  nroCuota: {
    type: Number,
    required: true
  },
  evento: {
    type: String,
    required: true,
    enum: ['pagado', 'despagado']
  },
  valorCuota: {
    type: Number
  },
  saldoPendienteAnterior: {
    type: Number
  },
  saldoPendienteNuevo: {
    type: Number
  },
  fechaPagoAnterior: {
    type: Date,
    default: null
  },
  fechaPagoNueva: {
    type: Date,
    default: null
  },
  origen: {
    type: String,
    required: true
  },
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Persona',
    default: null
  },
  usuarioNombre: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

registroPagoSchema.index({ clienteId: 1, createdAt: -1 });
registroPagoSchema.index({ creditoId: 1, nroCuota: 1, createdAt: -1 });

const RegistroPago = mongoose.model('RegistroPago', registroPagoSchema);

export default RegistroPago;
