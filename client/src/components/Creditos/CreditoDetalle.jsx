import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AlertCircle, Trash2, Award, Check, Calendar, Plus, Settings, Edit2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import RenovacionForm from './RenovacionForm';
import {
  determinarEstadoCredito,
  getColorEstado,
  formatearMoneda,
  calcularTotalMultasCredito,
  aplicarAbonosAutomaticamente,
  formatearFechaCorta,
  obtenerFechaHoy
} from '../../utils/creditCalculations';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import CowImage from '../../Icon/Cow.png';

// Componentes
import CreditoDetalleHeader from './CreditoDetalleHeader';
import EncabezadoFormulario from './EncabezadoFormulario';
import FormularioSolicitante from './FormularioSolicitante';
import FormularioCodeudor from './FormularioCodeudor';
import GrillaCuotas from './GrillaCuotas';
import ResumenCredito from './ResumenCredito';
import SelectorEtiquetas from './SelectorEtiquetas';
import BarraProgreso from './BarraProgreso';
import ListaCuotas from './ListaCuotas';
import FormularioDescuento from './FormularioDescuento';
import ListaDescuentos from './ListaDescuentos';
import ListaAbonos from './ListaAbonos';
import ListaNotas from './ListaNotas';
import EditorFecha from './EditorFecha';
import PanelEdicionFechas from './PanelEdicionFechas';

const CreditoDetalle = ({ credito: creditoInicial, clienteId, cliente, onClose, soloLectura = false }) => {
  const { registrarPago, cancelarPago, editarFechaCuota, agregarNota, eliminarNota, agregarMulta, editarMulta, eliminarMulta, agregarAbono, editarAbono, eliminarAbono, agregarDescuento, eliminarDescuento, asignarEtiquetaCredito, renovarCredito, toggleDesactivadoCredito, eliminarCredito, obtenerCredito, actualizarFechaCreacion } = useApp();
  const { user } = useAuth();

  // Obtener el crédito actualizado del contexto
  const creditoDesdeContext = obtenerCredito(clienteId, creditoInicial.id);
  const credito = creditoDesdeContext || creditoInicial;

  // Estado local para mantener el crédito actualizado (especialmente para multas)
  const [creditoActualizado, setCreditoActualizado] = useState(credito);
  const [cargandoCredito, setCargandoCredito] = useState(false);
  const skipSyncNext = useRef(false); // Ref para evitar que el siguiente sync de contexto sobrescriba cambios locales recientes




  // Cargar el crédito directamente del backend al montar para asegurar que tenga multas
  useEffect(() => {
    const cargarCreditoDelBackend = async () => {
      try {
        setCargandoCredito(true);
        const response = await api.get(`/creditos/${creditoInicial.id}`);
        if (response.success && response.data) {
          setCreditoActualizado(response.data);
          // El backend es la fuente de verdad: evitar que el siguiente sync del
          // contexto (GET /clientes, copia embebida posiblemente desactualizada)
          // sobrescriba los datos recién cargados del crédito.
          skipSyncNext.current = true;
        }
      } catch (error) {
        console.error('Error cargando crédito del backend:', error);
        // Si el crédito no existe (404 o mensaje de error), cerrar el modal automáticamente
        // PERO solo si NO estamos en modo soloLectura (permitir ver créditos archivados aunque fallen algunas validaciones)
        const errorMessage = error.message || '';
        if (!soloLectura && (errorMessage.includes('no encontrado') || errorMessage.includes('404') || errorMessage.includes('Crédito no encontrado'))) {
          if (onClose) {
            onClose();
          }
        }
      } finally {
        setCargandoCredito(false);
      }
    };

    // Siempre cargar del backend para asegurar que tenga todos los datos actualizados (incluyendo multas)
    if (creditoInicial && creditoInicial.id) {
      cargarCreditoDelBackend();
    } else if (!soloLectura && onClose) {
      // Si no hay ID válido, cerrar el modal (solo si no estamos en modo soloLectura)
      onClose();
    }
  }, [creditoInicial?.id, onClose, soloLectura]);

  // Si el crédito desaparece del contexto (p. ej. fue eliminado), cerrar el modal automáticamente
  // PERO solo si NO estamos en modo soloLectura (clientes archivados pueden no estar en el contexto)
  useEffect(() => {
    if (!soloLectura && !creditoDesdeContext) {
      // Llamamos a onClose para evitar error visual cuando el crédito fue borrado externamente
      try {
        onClose();
      } catch (e) {
        // noop
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditoDesdeContext, soloLectura]);

  // Unificar sincronización: Actualizar creditoActualizado cuando cambie el contexto o las propiedades críticas
  useEffect(() => {
    const nuevoCredito = creditoDesdeContext || creditoInicial;
    if (!nuevoCredito) return;

    // Si acabamos de actualizar localmente, ignoramos este sync para permitir que el backend/contexto se estabilice
    if (skipSyncNext.current) {
      console.log('CreditoDetalle - Omitiendo sync por skipSyncNext');
      skipSyncNext.current = false;
      return;
    }

    // Solo sincronizar si hay cambios reales en los datos críticos para evitar re-renders infinitos
    const checks = [
      JSON.stringify(creditoActualizado?.multas || []) !== JSON.stringify(nuevoCredito.multas || []),
      JSON.stringify(creditoActualizado?.notas || []) !== JSON.stringify(nuevoCredito.notas || []),
      JSON.stringify(creditoActualizado?.abonos || []) !== JSON.stringify(nuevoCredito.abonos || []),
      JSON.stringify(creditoActualizado?.abonosMulta || []) !== JSON.stringify(nuevoCredito.abonosMulta || []),
      creditoActualizado?.id !== nuevoCredito.id
    ];

    if (checks.some(change => change)) {
      setCreditoActualizado(nuevoCredito);
    }
  }, [creditoDesdeContext, creditoInicial, creditoActualizado]);


  // Eliminar efectos redundantes y multasVersion


  // Estados para el formulario
  const [formData, setFormData] = useState({
    tipoPago: credito.tipo || 'semanal',
    fechaInicio: credito.fechaInicio || '',
    valorProducto: credito.monto || '',
    valorCuota: credito.valorCuota || '',
    solicitante: {
      nombre: cliente?.nombre || credito.cliente?.nombre || '',
      cedula: cliente?.documento || credito.cliente?.cedula || '',
      direccionCasa: cliente?.direccion || credito.cliente?.direccion || '',
      direccionTrabajo: cliente?.direccionTrabajo || credito.cliente?.direccionTrabajo || '',
      telefono: cliente?.telefono || credito.cliente?.telefono || ''
    },
    codeudor: {
      nombre: cliente?.fiador?.nombre || credito.codeudor?.nombre || '',
      cedula: cliente?.fiador?.documento || credito.codeudor?.cedula || '',
      direccionCasa: cliente?.fiador?.direccion || credito.codeudor?.direccion || '',
      direccionTrabajo: cliente?.fiador?.direccionTrabajo || credito.codeudor?.direccionTrabajo || '',
      telefono: cliente?.fiador?.telefono || credito.codeudor?.telefono || ''
    }
  });

  const [nuevaNota, setNuevaNota] = useState('');
  const [mostrarFormularioMulta, setMostrarFormularioMulta] = useState(null);
  const [valorMulta, setValorMulta] = useState('');
  const [motivoMulta, setMotivoMulta] = useState('');
  const [mostrarFormularioAbono, setMostrarFormularioAbono] = useState(false);
  const [valorAbono, setValorAbono] = useState('');
  const [descripcionAbono, setDescripcionAbono] = useState('');
  const [fechaAbono, setFechaAbono] = useState(obtenerFechaHoy());
  const [mostrarFormularioDescuento, setMostrarFormularioDescuento] = useState(false);
  const [valorDescuento, setValorDescuento] = useState('');
  const [tipoDescuento, setTipoDescuento] = useState('dias');
  const [descripcionDescuento, setDescripcionDescuento] = useState('');
  const [mostrarSelectorEtiqueta, setMostrarSelectorEtiqueta] = useState(false);
  const [mostrarFormularioRenovacion, setMostrarFormularioRenovacion] = useState(false);
  const [mostrarEditorFecha, setMostrarEditorFecha] = useState(null);
  const [nuevaFecha, setNuevaFecha] = useState('');
  const [modoEdicionFechas, setModoEdicionFechas] = useState('automatico'); // 'automatico' | 'manual'

  // Estado para edición masiva de fechas
  const [mostrarPanelEdicion, setMostrarPanelEdicion] = useState(false);

  // Estado para edición de fecha de creación
  const [editandoFechaCreacion, setEditandoFechaCreacion] = useState(false);
  const [fechaCreacionEditada, setFechaCreacionEditada] = useState('');

  // Estado para edición de abonos (pagos)
  const [abonoEnEdicion, setAbonoEnEdicion] = useState(null);

  // Estados para el refactor de pagos/multas en grilla
  const [cuotaParaPagar, setCuotaParaPagar] = useState(null);
  const [multaParaPagar, setMultaParaPagar] = useState(null);
  const [mostrarModalNuevaMulta, setMostrarModalNuevaMulta] = useState(false);
  const [multaParaEditar, setMultaParaEditar] = useState(null);
  const [procesandoPago, setProcesandoPago] = useState(false);

  // Ref para el contenedor que se va a imprimir/exportar
  const formularioRef = useRef(null);

  const estado = determinarEstadoCredito(creditoActualizado.cuotas, creditoActualizado);
  const colorEstado = getColorEstado(estado);

  // Función para obtener el número de cuotas a mostrar
  const obtenerNumeroCuotas = (tipoPago) => {
    switch (tipoPago) {
      case 'diario':
        return 60;
      case 'semanal':
        return 10;
      case 'quincenal':
        return 5;
      case 'mensual':
        return 3;
      default:
        return 10;
    }
  };

  // Actualizar formulario cuando cambien los datos del cliente
  useEffect(() => {
    if (cliente) {
      setFormData(prev => ({
        ...prev,
        solicitante: {
          nombre: cliente.nombre || prev.solicitante.nombre,
          cedula: cliente.documento || prev.solicitante.cedula,
          direccionCasa: cliente.direccion || prev.solicitante.direccionCasa,
          direccionTrabajo: cliente.direccionTrabajo || prev.solicitante.direccionTrabajo,
          telefono: cliente.telefono || prev.solicitante.telefono
        },
        codeudor: {
          nombre: cliente.fiador?.nombre || prev.codeudor.nombre,
          cedula: cliente.fiador?.documento || prev.codeudor.cedula,
          direccionCasa: cliente.fiador?.direccion || prev.codeudor.direccionCasa,
          direccionTrabajo: cliente.fiador?.direccionTrabajo || prev.codeudor.direccionTrabajo,
          telefono: cliente.fiador?.telefono || prev.codeudor.telefono
        }
      }));
    }
  }, [cliente]);

  // Actualizar tipo de pago cuando cambie el crédito
  useEffect(() => {
    if (credito.tipo) {
      setFormData(prev => ({
        ...prev,
        tipoPago: credito.tipo
      }));
    }
  }, [credito.tipo]);

  // Funciones para manejar cambios en el formulario
  const handleSolicitanteChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      solicitante: {
        ...prev.solicitante,
        [field]: value
      }
    }));
  };

  const handleCodeudorChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      codeudor: {
        ...prev.codeudor,
        [field]: value
      }
    }));
  };

  // NOTA: esta función (junto con el componente ListaCuotas que la usa) no está
  // conectada a la vista actual de cuotas -- el flujo de pago real es
  // GrillaCuotas -> CuotaCard -> ModalPago -> handleConfirmarPago (más abajo en
  // este archivo), que sí espera la respuesta del servidor y bloquea el botón
  // mientras la petición está en curso. Se deja corregida (await + manejo de
  // error) por si en el futuro se vuelve a usar, para no reintroducir la
  // condición de carrera de "clic rápido dispara pagos superpuestos".
  const handlePago = async (nroCuota, pagado, fechaPago = null) => {
    try {
      if (pagado) {
        await cancelarPago(clienteId, credito.id, nroCuota);
      } else {
        await registrarPago(clienteId, credito.id, nroCuota, fechaPago);
      }
    } catch (error) {
      console.error('Error registrando/cancelando pago:', error);
      alert('Hubo un error al procesar el pago. Por favor, intenta de nuevo.');
    }
  };

  const handleEditarFecha = (nroCuota, fechaActual) => {
    setMostrarEditorFecha(nroCuota);
    // Extraer solo la parte de fecha (YYYY-MM-DD) del ISO string para el input type="date"
    // Si viene como ISO string, tomar los primeros 10 caracteres
    // Si ya es YYYY-MM-DD, usarlo directamente
    let fechaFormateada = fechaActual;
    if (typeof fechaActual === 'string' && fechaActual.includes('T')) {
      fechaFormateada = fechaActual.substring(0, 10);
    } else if (fechaActual instanceof Date) {
      // Si es objeto Date, formatearlo a YYYY-MM-DD en hora local
      const year = fechaActual.getFullYear();
      const month = String(fechaActual.getMonth() + 1).padStart(2, '0');
      const day = String(fechaActual.getDate()).padStart(2, '0');
      fechaFormateada = `${year}-${month}-${day}`;
    }
    setNuevaFecha(fechaFormateada);
  };

  const handleGuardarFecha = () => {
    if (nuevaFecha && mostrarEditorFecha) {
      // Asegurar que la fecha se envía como mediodía local para evitar desfase UTC
      // Crear fecha local a mediodía (12:00) del día seleccionado
      // Usar formato YYYY-MM-DDTHH:mm:ss para crear fecha local explícitamente
      const [year, month, day] = nuevaFecha.split('-').map(Number);
      const fechaLocal = new Date(year, month - 1, day, 12, 0, 0, 0);

      editarFechaCuota(clienteId, credito.id, mostrarEditorFecha, fechaLocal.toISOString(), modoEdicionFechas);
      // Pequeño delay para asegurar que el estado se actualice
      setTimeout(() => {
        setMostrarEditorFecha(null);
        setNuevaFecha('');
      }, 100);
    }
  };

  const handleCancelarEdicionFecha = () => {
    setMostrarEditorFecha(null);
    setNuevaFecha('');
  };

  // Handlers para edición masiva de fechas
  const handleAbrirPanelEdicion = () => {
    setMostrarPanelEdicion(true);
  };

  const handleGuardarEdicionMasiva = async (fechasEditadas) => {
    try {
      const cuotasNoPagadas = cuotasActualizadas.filter(c => !c.pagado);
      const cuotasModificadas = [];
      
      // Identificar cuotas que realmente cambiaron
      for (let i = 0; i < cuotasNoPagadas.length; i++) {
        const cuota = cuotasNoPagadas[i];
        const nuevaFecha = fechasEditadas[i];
        
        if (nuevaFecha && nuevaFecha !== cuota.fechaProgramada.substring(0, 10)) {
          // Convertir a formato ISO string
          const [year, month, day] = nuevaFecha.split('-').map(Number);
          const fechaISO = new Date(year, month - 1, day, 12, 0, 0, 0).toISOString();
          
          cuotasModificadas.push({
            ...cuota,
            fechaProgramada: fechaISO
          });
        }
      }
      
      // Si no hay cambios, cerrar panel
      if (cuotasModificadas.length === 0) {
        setMostrarPanelEdicion(false);
        return;
      }
      
      // Crear array completo de cuotas con los cambios aplicados
      const cuotasActualizadasCompletas = cuotasActualizadas.map(cuota => {
        const cuotaModificada = cuotasModificadas.find(cm => cm.nroCuota === cuota.nroCuota);
        if (cuotaModificada) {
          return cuotaModificada;
        }
        return cuota;
      });
      
      // Si está en modo automático, ajustar cuotas posteriores
      if (modoEdicionFechas === 'automatico') {
        // Para cada cuota modificada, ajustar las posteriores
        for (const cuotaModificada of cuotasModificadas) {
          const indiceOriginal = cuotasActualizadas.findIndex(c => c.nroCuota === cuotaModificada.nroCuota);
          const fechaOriginal = cuotasActualizadas[indiceOriginal];
          
          // Calcular diferencia en días
          const [yearN, monthN, dayN] = cuotaModificada.fechaProgramada.substring(0, 10).split('-').map(Number);
          const [yearO, monthO, dayO] = fechaOriginal.fechaProgramada.substring(0, 10).split('-').map(Number);
          
          const fechaNueva = new Date(yearN, monthN - 1, dayN, 12, 0, 0, 0);
          const fechaOriginalDate = new Date(yearO, monthO - 1, dayO, 12, 0, 0, 0);
          const diferenciaDias = Math.floor((fechaNueva - fechaOriginalDate) / (1000 * 60 * 60 * 24));
          
          // Ajustar cuotas posteriores
          for (let i = indiceOriginal + 1; i < cuotasActualizadasCompletas.length; i++) {
            const cuotaPosterior = cuotasActualizadasCompletas[i];
            if (!cuotaPosterior.pagado) {
              const [yearP, monthP, dayP] = cuotaPosterior.fechaProgramada.substring(0, 10).split('-').map(Number);
              const fechaPosterior = new Date(yearP, monthP - 1, dayP, 12, 0, 0, 0);
              fechaPosterior.setDate(fechaPosterior.getDate() + diferenciaDias);
              
              cuotasActualizadasCompletas[i] = {
                ...cuotaPosterior,
                fechaProgramada: fechaPosterior.toISOString()
              };
            }
          }
        }
      }
      
      // Llamada única al backend con todas las cuotas actualizadas
      await api.put(`/creditos/${credito.id}`, {
        cuotas: cuotasActualizadasCompletas
      });
      
      // Actualizar estado local
      setCreditoActualizado(prev => ({
        ...prev,
        cuotas: cuotasActualizadasCompletas
      }));
      
      // Cerrar panel
      setMostrarPanelEdicion(false);
    } catch (error) {
      console.error('Error guardando edición masiva:', error);
      alert('Error al guardar los cambios. Por favor intente nuevamente.');
    }
  };

  const handleCancelarEdicionMasiva = () => {
    setMostrarPanelEdicion(false);
  };

  // Funciones para manejar edición de fecha de creación
  const handleEditarFechaCreacion = () => {
    let fechaFormateada = credito.fechaCreacion;
    if (credito.fechaCreacion) {
      fechaFormateada = new Date(credito.fechaCreacion).toISOString().split('T')[0];
    }
    setFechaCreacionEditada(fechaFormateada);
    setEditandoFechaCreacion(true);
  };

  const handleGuardarFechaCreacion = async () => {
    if (fechaCreacionEditada) {
      const [year, month, day] = fechaCreacionEditada.split('-').map(Number);
      const fechaLocal = new Date(year, month - 1, day, 12, 0, 0, 0);
      
      // Llamar a la función del contexto (se agregará en la FASE 7)
      try {
        await api.put(`/creditos/${credito.id}/fecha-creacion`, {
          fechaCreacion: fechaLocal.toISOString()
        });
        
        // Actualizar estado local
        setCreditoActualizado(prev => ({
          ...prev,
          fechaCreacion: fechaLocal.toISOString()
        }));
        
        setEditandoFechaCreacion(false);
      } catch (error) {
        console.error('Error actualizando fecha de creación:', error);
        alert('Error al guardar la fecha de creación. Por favor intente nuevamente.');
      }
    }
  };

  const handleCancelarEdicionFechaCreacion = () => {
    setEditandoFechaCreacion(false);
    setFechaCreacionEditada('');
  };

  const handleEliminarCredito = async () => {
    const confirmacion = window.confirm(
      `¿Estás seguro de eliminar este crédito?\n\n` +
      `Crédito ID: ${credito.id}\n` +
      `Monto: ${formatearMoneda(credito.monto)}\n` +
      `Estado: ${estado}\n\n` +
      `Esta acción no se puede deshacer.`
    );

    if (confirmacion) {
      try {
        await eliminarCredito(clienteId, credito.id);
      } catch (e) {
        console.error('Error eliminando crédito desde UI:', e);
      }
      // onClose() puede ser llamado por el efecto cuando el contexto se actualice,
      // pero lo llamamos también aquí para cerrar inmediatamente si la eliminación fue local.
      try { onClose(); } catch (e) { /* noop */ }
    }
  };

  const handleAgregarNota = async (e) => {
    e.preventDefault();
    if (!nuevaNota.trim()) return;
    try {
      skipSyncNext.current = true;
      await agregarNota(clienteId, credito.id, nuevaNota);
      setNuevaNota('');
      // Recargar para ver cambios
      const response = await api.get(`/creditos/${credito.id}`);
      if (response.success) setCreditoActualizado(response.data);
    } catch (err) {
      skipSyncNext.current = false;
      console.error('Error agregando nota:', err);
      alert(err.message || 'Error al guardar la nota. Verifica tu conexión e intenta nuevamente.');
    }
  };

  const handleEliminarNota = async (notaId) => {
    if (confirm('¿Estás seguro de eliminar esta nota?')) {
      try {
        skipSyncNext.current = true;
        await eliminarNota(clienteId, credito.id, notaId);
        const response = await api.get(`/creditos/${credito.id}`);
        if (response.success) setCreditoActualizado(response.data);
      } catch (err) {
        skipSyncNext.current = false;
        console.error('Error eliminando nota:', err);
        alert(err.message || 'Error al eliminar la nota. Intenta nuevamente.');
      }
    }
  };



  const handleEditarMulta = (multa) => {
    // Extraer el motivo sin la referencia a cuota para edición
    const motivoSinRef = multa.motivo ? multa.motivo.replace(/\s*\(Ref\. Cuota #\d+\)/, '') : '';
    const fechaBase = multa.fecha ? (multa.fecha.includes('T') ? multa.fecha.split('T')[0] : multa.fecha) : obtenerFechaHoy();

    setMultaParaEditar({
      ...multa,
      motivo: motivoSinRef,
      fecha: fechaBase
    });
  };

  const handleGuardarEdicionMulta = async (valor, fecha, motivo) => {
    if (!multaParaEditar) return;

    try {
      setProcesandoPago(true);
      skipSyncNext.current = true;
      const creditoActualizadoRespuesta = await editarMulta(
        clienteId,
        credito.id,
        multaParaEditar.id,
        valor,
        fecha,
        motivo
      );

      if (creditoActualizadoRespuesta) {
        setCreditoActualizado(creditoActualizadoRespuesta);
      } else {
        const response = await api.get(`/creditos/${credito.id}`);
        if (response.success) setCreditoActualizado(response.data);
      }
      setMultaParaEditar(null);
    } catch (error) {
      skipSyncNext.current = false;
      console.error('Error editando multa:', error);
      alert('Error al editar la multa. Por favor, intente nuevamente.');
    } finally {
      setProcesandoPago(false);
    }
  };

  const handleEliminarMulta = async (multaId) => {
    if (!confirm('¿Estás seguro de eliminar esta multa?')) return;

    try {
      setProcesandoPago(true);
      skipSyncNext.current = true;
      const creditoActualizadoRespuesta = await eliminarMulta(clienteId, credito.id, multaId);
      if (creditoActualizadoRespuesta) {
        setCreditoActualizado(creditoActualizadoRespuesta);
      } else {
        const response = await api.get(`/creditos/${credito.id}`);
        if (response.success) setCreditoActualizado(response.data);
      }
      // Cerrar el modal de edición si está abierto
      setMultaParaEditar(null);
    } catch (error) {
      skipSyncNext.current = false;
      console.error('Error eliminando multa:', error);
      alert('Error al eliminar la multa. Por favor, intente nuevamente.');
    } finally {
      setProcesandoPago(false);
    }
  };

  const handlePagarMulta = (multa) => {
    // Calcular saldo pendiente de la multa usando abonosMulta (independiente de abonos de cuotas)
    const abonosMulta = (creditoActualizado.abonosMulta || []).filter(a => a.multaId === multa.id);
    const totalAbonado = abonosMulta.reduce((sum, a) => sum + a.valor, 0);
    const saldoPendiente = multa.valor - totalAbonado;

    setMultaParaPagar({
      multa,
      valorPendiente: saldoPendiente > 0 ? saldoPendiente : multa.valor
    });
  };

  const handleConfirmarPagoMulta = async ({ valor, fecha, descripcion }) => {
    if (!multaParaPagar) return;
    const { multa } = multaParaPagar;
    const valorNumerico = parseFloat(valor);

    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      alert("Valor inválido");
      return;
    }

    // Validar contra el saldo pendiente para evitar pagos duplicados o en exceso
    const abonosDeLaMulta = (creditoActualizado.abonosMulta || []).filter(a => String(a.multaId) === String(multa.id));
    const totalAbonadoMulta = abonosDeLaMulta.reduce((sum, a) => sum + (a.valor || 0), 0);
    const saldoPendienteMulta = multa.valor - totalAbonadoMulta;

    if (saldoPendienteMulta <= 0) {
      alert('Esta multa ya está pagada en su totalidad.');
      setMultaParaPagar(null);
      return;
    }
    if (valorNumerico > saldoPendienteMulta) {
      alert(`El valor ingresado excede el saldo pendiente de la multa ($${saldoPendienteMulta.toLocaleString('es-CO')})`);
      return;
    }

    const descFinal = descripcion || `Pago Multa - ${multa.motivo}`;

    // Pasar multaId para que el backend agregue el abono a abonosMulta (independiente de abonos de cuotas)
    try {
      setProcesandoPago(true);
      skipSyncNext.current = true;
      await agregarAbono(clienteId, credito.id, valorNumerico, descFinal, fecha, 'multa', null, multa.id);

      // Obtener el crédito actualizado del backend
      const response = await api.get(`/creditos/${credito.id}`);
      if (response.success && response.data) {
        setCreditoActualizado(response.data);
      }
      setMultaParaPagar(null);
    } catch (error) {
      skipSyncNext.current = false;
      console.error('Error agregando abono de multa:', error);
      alert(error.message || 'Error al procesar el pago de la multa. Por favor, intente nuevamente.');
      // Re-sincronizar el crédito por si el estado local estaba desactualizado
      // (p. ej. la multa ya fue pagada desde otra pestaña o sesión)
      try {
        const response = await api.get(`/creditos/${credito.id}`);
        if (response.success && response.data) {
          setCreditoActualizado(response.data);
          setMultaParaPagar(null);
        }
      } catch (syncError) {
        console.error('Error re-sincronizando crédito:', syncError);
      }
    } finally {
      setProcesandoPago(false);
    }
  };

  const handleAgregarAbono = async () => {
    if (procesandoPago) return;

    if (!valorAbono || parseFloat(valorAbono) <= 0) {
      alert('Por favor ingresa un valor válido para el abono');
      return;
    }

    if (!fechaAbono) {
      alert('Por favor selecciona una fecha para el abono');
      return;
    }

    try {
      setProcesandoPago(true);
      skipSyncNext.current = true;
      await agregarAbono(clienteId, credito.id, parseFloat(valorAbono), descripcionAbono, fechaAbono);
      const response = await api.get(`/creditos/${credito.id}`);
      if (response.success) setCreditoActualizado(response.data);
      // Solo limpiar/cerrar el formulario si el abono realmente se guardó
      setMostrarFormularioAbono(false);
      setValorAbono('');
      setDescripcionAbono('');
      setFechaAbono(obtenerFechaHoy());
    } catch (err) {
      skipSyncNext.current = false;
      console.error('Error agregando abono:', err);
      alert(err.message || 'Error al guardar el abono. Verifica tu conexión e intenta nuevamente.');
    } finally {
      setProcesandoPago(false);
    }
  };

  const handleEliminarAbono = async (abonoId) => {
    if (confirm('¿Estás seguro de eliminar este abono?')) {
      try {
        skipSyncNext.current = true;
        await eliminarAbono(clienteId, credito.id, abonoId);
        const response = await api.get(`/creditos/${credito.id}`);
        if (response.success) setCreditoActualizado(response.data);
      } catch (err) {
        skipSyncNext.current = false;
        console.error('Error eliminando abono:', err);
        alert(err.message || 'Error al eliminar el abono. Intenta nuevamente.');
      }
    }
  };


  const handleEditarAbono = (abono) => {
    // Asegurarse de que el abono tenga el ID del abono original
    let abonoConId = { ...abono };

    // Si el abono no tiene ID, buscarlo en abonos de cuotas o abonos de multas
    if (!abonoConId.id) {
      const fechaAbono = abono.fecha ? (typeof abono.fecha === 'string' ? abono.fecha.split('T')[0] : new Date(abono.fecha).toISOString().split('T')[0]) : null;
      const valorAbono = abono.valor || abono.valorAplicado;

      // Buscar primero en abonos de cuotas
      if (credito.abonos) {
        const abonoOriginal = credito.abonos.find(a => {
          if (!a.id) return false;
          const fechaA = a.fecha ? (typeof a.fecha === 'string' ? a.fecha.split('T')[0] : new Date(a.fecha).toISOString().split('T')[0]) : null;
          const fechaCoincide = fechaA === fechaAbono;
          const valorCoincide = Math.abs(a.valor - valorAbono) < 0.01;
          return fechaCoincide && valorCoincide;
        });

        if (abonoOriginal && abonoOriginal.id) {
          abonoConId.id = abonoOriginal.id;
        }
      }

      // Si no se encontró en abonos de cuotas, buscar en abonos de multas
      if (!abonoConId.id && credito.abonosMulta) {
        const abonoMultaOriginal = credito.abonosMulta.find(a => {
          if (!a.id) return false;
          const fechaA = a.fecha ? (typeof a.fecha === 'string' ? a.fecha.split('T')[0] : new Date(a.fecha).toISOString().split('T')[0]) : null;
          const fechaCoincide = fechaA === fechaAbono;
          const valorCoincide = Math.abs(a.valor - valorAbono) < 0.01;
          return fechaCoincide && valorCoincide;
        });

        if (abonoMultaOriginal && abonoMultaOriginal.id) {
          abonoConId.id = abonoMultaOriginal.id;
        }
      }
    }

    setAbonoEnEdicion(abonoConId);
  };

  const handleGuardarEdicionAbono = ({ valor, fecha, descripcion, nroCuota }) => {
    if (!abonoEnEdicion) return;
    const valorNumerico = parseFloat(valor);
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      alert('Por favor ingresa un valor válido para el abono');
      return;
    }

    // Normalizar la fecha a formato YYYY-MM-DD antes de enviarla al backend
    let fechaNormalizada = fecha;
    if (fecha) {
      if (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
        fechaNormalizada = fecha; // Ya está en formato correcto
      } else if (typeof fecha === 'string') {
        // Intentar extraer la fecha si viene en formato ISO
        fechaNormalizada = fecha.split('T')[0];
      } else if (fecha instanceof Date) {
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        fechaNormalizada = `${year}-${month}-${day}`;
      }
    }

    // Si el abono no tiene id, intentar encontrarlo en abonos de cuotas o abonos de multas
    let abonoId = abonoEnEdicion.id;
    let esAbonoMulta = false;

    if (!abonoId) {
      // Buscar primero en abonos de cuotas
      const valorOriginal = abonoEnEdicion.valor || abonoEnEdicion.valorAplicado || valorNumerico;
      const fechaOriginal = abonoEnEdicion.fecha ? (typeof abonoEnEdicion.fecha === 'string' ? abonoEnEdicion.fecha.split('T')[0] : new Date(abonoEnEdicion.fecha).toISOString().split('T')[0]) : null;

      // Buscar en abonos de cuotas
      if (credito.abonos) {
        const abonoEncontrado = credito.abonos.find(a => {
          if (!a.id) return false;
          const valorCoincide = Math.abs(a.valor - valorOriginal) < 0.01;
          const fechaAbono = a.fecha ? (typeof a.fecha === 'string' ? a.fecha.split('T')[0] : new Date(a.fecha).toISOString().split('T')[0]) : null;
          const fechaCoincide = !fechaOriginal || fechaAbono === fechaOriginal;
          return valorCoincide && fechaCoincide;
        });

        if (abonoEncontrado && abonoEncontrado.id) {
          abonoId = abonoEncontrado.id;
        }
      }

      // Si no se encontró en abonos de cuotas, buscar en abonos de multas
      if (!abonoId && credito.abonosMulta) {
        const abonoMultaEncontrado = credito.abonosMulta.find(a => {
          if (!a.id) return false;
          const valorCoincide = Math.abs(a.valor - valorOriginal) < 0.01;
          const fechaAbono = a.fecha ? (typeof a.fecha === 'string' ? a.fecha.split('T')[0] : new Date(a.fecha).toISOString().split('T')[0]) : null;
          const fechaCoincide = !fechaOriginal || fechaAbono === fechaOriginal;
          return valorCoincide && fechaCoincide;
        });

        if (abonoMultaEncontrado && abonoMultaEncontrado.id) {
          abonoId = abonoMultaEncontrado.id;
          esAbonoMulta = true;
        }
      }
    } else {
      // Si ya tiene ID, verificar si es abono de multa buscando en abonosMulta
      if (credito.abonosMulta && credito.abonosMulta.some(a => a.id === abonoId)) {
        esAbonoMulta = true;
      }
    }

    if (!abonoId) {
      alert('No se pudo encontrar el abono para editar. Por favor, intente eliminar y crear un nuevo abono.');
      return;
    }

    // Si es abono de multa, no enviar nroCuota
    const processEdit = async () => {
      try {
        skipSyncNext.current = true;
        await editarAbono(clienteId, credito.id, abonoId, {
          valor: valorNumerico,
          fecha: fechaNormalizada,
          descripcion,
          nroCuota: esAbonoMulta ? null : (nroCuota ? parseInt(nroCuota, 10) : null)
        });
        const response = await api.get(`/creditos/${credito.id}`);
        if (response.success) setCreditoActualizado(response.data);
        // Solo cerrar el editor si la edición realmente se guardó
        setAbonoEnEdicion(null);
      } catch (err) {
        skipSyncNext.current = false;
        console.error('Error editando abono:', err);
        alert(err.message || 'Error al editar el abono. Verifica tu conexión e intenta nuevamente.');
      }
    };
    processEdit();
  };

  const handleAgregarDescuento = () => {
    if (!valorDescuento || parseFloat(valorDescuento) <= 0) {
      alert('Por favor ingresa un valor válido para el descuento');
      return;
    }
    agregarDescuento(clienteId, credito.id, parseFloat(valorDescuento), tipoDescuento, descripcionDescuento);
    setMostrarFormularioDescuento(false);
    setValorDescuento('');
    setTipoDescuento('dias');
    setDescripcionDescuento('');
  };

  const handleEliminarDescuento = (descuentoId) => {
    if (confirm('¿Estás seguro de eliminar este descuento?')) {
      eliminarDescuento(clienteId, credito.id, descuentoId);
    }
  };

  // Calcular total de multas desde el array raíz del crédito
  const totalMultasCredito = calcularTotalMultasCredito(creditoActualizado.cuotas || [], creditoActualizado);
  const totalAbonos = (creditoActualizado.abonos || []).reduce((total, abono) => total + abono.valor, 0);
  const totalDescuentos = (creditoActualizado.descuentos || []).reduce((total, descuento) => total + descuento.valor, 0);
  // Aplicar abonos automáticamente
  const { cuotasActualizadas } = aplicarAbonosAutomaticamente(creditoActualizado);

  // Obtener multas independientes del crédito
  const multasIndependientes = (creditoActualizado.multas || []).filter(m => !m.pagada);

  // Handlers para el nuevo sistema de pagos/multas en grilla
  const handleAbrirPago = (nroCuota) => {
    const cuota = cuotasActualizadas.find(c => c.nroCuota === nroCuota);
    if (!cuota) return;

    // Ya no incluimos multas en el cálculo de la cuota, solo el capital
    const valorBaseCuota = credito.valorCuota || 0;
    const abonoYaAplicado = cuota.abonoAplicado || 0;

    const valorRestante = valorBaseCuota - abonoYaAplicado;

    setCuotaParaPagar({
      nroCuota,
      valorPendiente: valorRestante > 0 ? valorRestante : 0
    });
  };

  const handleConfirmarPago = async ({ valor, fecha, descripcion }) => {
    if (!cuotaParaPagar) return;
    const { nroCuota } = cuotaParaPagar;
    const valorNumerico = parseFloat(valor);

    // Aseguramos que la descripción incluya la cuota para el trackeo correcto
    const descFinal = descripcion
      ? (descripcion.includes(`Cuota #${nroCuota}`) ? descripcion : `${descripcion} (Cuota #${nroCuota})`)
      : `Abono a Cuota #${nroCuota}`;

    // Confirmar que valor es número
    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      alert("Valor inválido");
      return;
    }

    try {
      setProcesandoPago(true);
      skipSyncNext.current = true;
      // Siempre agregamos como abono para mantener el historial visual y la lógica de asignación específica
      await agregarAbono(clienteId, credito.id, valorNumerico, descFinal, fecha);
      const response = await api.get(`/creditos/${credito.id}`);
      if (response.success) setCreditoActualizado(response.data);
      setCuotaParaPagar(null);
    } catch (error) {
      skipSyncNext.current = false;
      console.error('Error procesando pago:', error);
      alert('Error al procesar el pago. Por favor, intente nuevamente.');
    } finally {
      setProcesandoPago(false);
    }

  };

  const handleConfirmarMulta = async ({ valor, fecha, motivo }) => {
    // Se agrega la multa independiente (sin nroCuota)
    const motivoFinal = fecha ? `${motivo} (${fecha})` : motivo;
    try {
      setProcesandoPago(true);
      skipSyncNext.current = true;
      const creditoActualizadoRespuesta = await agregarMulta(clienteId, credito.id, parseFloat(valor), motivoFinal);
      // Si la respuesta incluye el crédito actualizado, usarlo directamente
      if (creditoActualizadoRespuesta) {
        setCreditoActualizado(creditoActualizadoRespuesta);
      } else {
        const response = await api.get(`/creditos/${credito.id}`);
        if (response.success) setCreditoActualizado(response.data);
      }
      setMostrarModalNuevaMulta(false);
    } catch (error) {
      skipSyncNext.current = false;
      console.error('Error agregando multa:', error);
      alert('Error al crear la multa. Por favor, intente nuevamente.');
    } finally {
      setProcesandoPago(false);
    }
  };



  // Multas independientes del crédito (ya no están en cuotas)
  const todasLasMultas = useMemo(() => {
    // Intentar usar creditoActualizado primero, luego credito, luego creditoInicial
    const creditoConMultas = creditoActualizado?.multas ? creditoActualizado :
      credito?.multas ? credito :
        creditoInicial?.multas ? creditoInicial : null;
    const multas = creditoConMultas?.multas || [];
    const abonosMulta = creditoConMultas?.abonosMulta || []; // Usar abonosMulta (independiente)

    if (multas.length === 0) {
      return [];
    }

    return multas.map(multa => {
      // Calcular abonos aplicados a esta multa usando abonosMulta (independiente de abonos de cuotas)
      const abonosDeEstaMulta = abonosMulta.filter(a => a.multaId === multa.id);
      const totalAbonado = abonosDeEstaMulta.reduce((sum, a) => sum + a.valor, 0);
      const saldoPendiente = multa.valor - totalAbonado;
      const pagada = saldoPendiente <= 0;
      const parcialmentePagada = totalAbonado > 0 && saldoPendiente > 0;

      // Extraer nroCuota del motivo si existe (formato: "motivo (Ref. Cuota #X)")
      let nroCuota = null;
      const motivo = multa.motivo || '';
      const match = motivo.match(/\(Ref\. Cuota #(\d+)\)/);
      if (match) {
        nroCuota = parseInt(match[1], 10);
      }

      return {
        id: multa.id,
        valor: multa.valor,
        fecha: multa.fecha,
        motivo: motivo.replace(/\s*\(Ref\. Cuota #\d+\)/, ''), // Remover la referencia del motivo para mostrar
        nroCuota,
        pagada,
        parcialmentePagada,
        totalAbonado,
        saldoPendiente: saldoPendiente > 0 ? saldoPendiente : 0
      };
    }).sort((a, b) => {
      const fechaA = a.fecha ? new Date(a.fecha) : new Date(0);
      const fechaB = b.fecha ? new Date(b.fecha) : new Date(0);
      return fechaB - fechaA;
    });
  }, [creditoActualizado]);

  // Calcular progreso considerando cuotas pagadas con abonos (sin multas)
  const progreso = (() => {
    const totalCuotas = credito.cuotas.length;
    let cuotasPagadas = 0;

    cuotasActualizadas.forEach((cuota) => {
      // Verificar si está pagada manualmente O si el abono cubre completamente la cuota
      // Ya no incluimos multas en el cálculo del valor restante
      const valorRestante = credito.valorCuota - (cuota.abonoAplicado || 0);

      const isPaid = cuota.pagado || (valorRestante <= 0 && cuota.abonoAplicado > 0);

      if (isPaid) {
        cuotasPagadas++;
      }
    });

    return {
      cuotasPagadas,
      totalCuotas,
      porcentaje: Math.round((cuotasPagadas / totalCuotas) * 100)
    };
  })();

  // Definición de etiquetas
  const ETIQUETAS = {
    excelente: {
      nombre: 'Excelente',
      descripcion: 'Pagó todo a tiempo',
      color: 'bg-green-100 text-green-800 border-green-300',
      icono: Award
    },
    bueno: {
      nombre: 'Bueno',
      descripcion: 'Completó sin problemas',
      color: 'bg-blue-100 text-blue-800 border-blue-300',
      icono: Check
    },
    atrasado: {
      nombre: 'Atrasado',
      descripcion: 'Completó con retrasos',
      color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      icono: Calendar
    },
    incompleto: {
      nombre: 'Incompleto',
      descripcion: 'No terminó de pagar',
      color: 'bg-red-100 text-red-800 border-red-300',
      icono: AlertCircle
    }
  };

  const handleAsignarEtiqueta = (tipoEtiqueta) => {
    asignarEtiquetaCredito(clienteId, credito.id, tipoEtiqueta);
    setMostrarSelectorEtiqueta(false);
  };

  // Verificar si puede renovar
  // Contar cuotas pagadas (tanto manualmente como con abonos, sin considerar multas)
  const cuotasPagadas = (() => {
    let contador = 0;
    cuotasActualizadas.forEach((cuota) => {
      // Verificar si está pagada manualmente O si el abono cubre completamente la cuota
      // Ya no incluimos multas en el cálculo
      const valorRestante = credito.valorCuota - (cuota.abonoAplicado || 0);

      const isPaid = cuota.pagado || (valorRestante <= 0 && cuota.abonoAplicado > 0);

      if (isPaid) {
        contador++;
      }
    });
    return contador;
  })();

  const puedeRenovar = (() => {
    // Si el rol es ceo, puede renovar siempre que no esté ya renovado o finalizado
    if (user?.role === 'ceo') {
      return !credito.renovado && !credito.desactivado && estado !== 'finalizado';
    }

    if (credito.renovado) return false; // Ya fue renovado
    if (credito.desactivado) return false; // Está desactivado
    if (estado === 'finalizado') return false; // Ya está finalizado

    switch (credito.tipo) {
      case 'semanal':
        return cuotasPagadas >= 7;
      case 'quincenal':
        return cuotasPagadas >= 3;
      case 'mensual':
        return cuotasPagadas >= 2;
      default:
        return false;
    }
  })();

  const handleToggleDesactivado = async () => {
    const desactivar = !credito.desactivado;
    const mensaje = desactivar
      ? '¿Desactivar este crédito? Dejará de contar como activo (modalidad del cliente, día de cobro, rutas). Su historial se conserva y puedes reactivarlo cuando quieras.'
      : '¿Reactivar este crédito? Volverá a contar como activo en todas las vistas.';
    if (!confirm(mensaje)) return;

    try {
      await toggleDesactivadoCredito(clienteId, credito.id, desactivar);
      onClose();
    } catch (error) {
      alert(error.message || 'No fue posible cambiar el estado del crédito.');
    }
  };

  const handleRenovar = async (datosRenovacion) => {
    try {
      await renovarCredito(clienteId, credito.id, datosRenovacion);
      setMostrarFormularioRenovacion(false);
      onClose();
    } catch (error) {
      alert(error.message || 'No fue posible renovar el crédito. Verifique antes de reintentar.');
    }
  };

  // Función para imprimir/exportar a PDF
  const handlePrint = useReactToPrint({
    contentRef: formularioRef,
    documentTitle: `credito-${cliente?.nombre?.replace(/\s+/g, '-') || 'cliente'}-${credito.id}-${obtenerFechaHoy()}`,
    pageStyle: `
      @page {
        size: A4;
        margin: 8mm;
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Contenedor principal del PDF: reducir escala para intentar que quepa en una sola hoja */
        .print-container {
          transform: scale(0.8);
          transform-origin: top left;
        }

        /* Reducir tipografía y espaciados generales en impresión */
        .print-container * {
          font-size: 11px !important;
          line-height: 1.2 !important;
        }

        /* Ajustar paddings/márgenes de las tarjetas principales */
        .print-compact-card {
          padding: 8px !important;
          margin-bottom: 8px !important;
        }

        /* Formulario de solicitante más horizontal en impresión */
        .print-container .solicitante-section {
          margin-bottom: 4px !important;
        }

        .print-container .solicitante-section h3 {
          margin-bottom: 4px !important;
          font-size: 16px !important;
        }

        .print-container .solicitante-fields {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          column-gap: 8px !important;
          row-gap: 2px !important;
        }

        .print-container .solicitante-field {
          margin-bottom: 0 !important;
        }

        /* Hacer la grilla de cuotas más compacta en impresión */
        .print-container .cuotas-grid {
          gap: 4px !important;
          grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        }

        /* Hacer cada tarjeta de cuota compacta, pero permitiendo que crezca si hay muchos abonos */
        .print-container .cuota-card {
          min-height: 10.5rem !important;
          height: auto !important;
          padding: 4px !important;
        }

        /* En impresión, mostrar completamente los abonos dentro de cada cuota (sin scroll) */
        .print-container .cuota-card .abonos-list {
          overflow: visible !important;
          max-height: none !important;
          font-size: 9px !important;
          line-height: 1.1 !important;
        }

        /* Comprimir un poco la tarjeta de recobro/multas en impresión */
        .print-container .recobro-card {
          padding: 4px !important;
          max-height: 9rem !important;
        }

        /* Evitar que los títulos queden solos al final de la página */
        h3, h2 {
          page-break-after: avoid;
          break-after: avoid;
        }

        /* Mantener secciones juntas */
        .print-section {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* Espaciado entre secciones más compacto en impresión */
        .print-section {
          margin-bottom: 12px;
        }

        /* Evitar que la grilla se corte mal */
        .print-grid-item {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      }
    `
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full max-h-[95vh] flex flex-col">
        <CreditoDetalleHeader onClose={onClose} onPrint={handlePrint} />

        <div className="px-4 md:px-8 pt-6 md:pt-10 pb-8 space-y-6 overflow-y-auto flex-1">
          {/* Contenedor para imprimir - incluye header, formulario y grilla */}
          <div ref={formularioRef} className="print-container">
            {/* Header para el PDF (solo visible al imprimir, logo pequeño en esquina) */}
            <div className="hidden print:flex bg-white px-6 py-3 items-center justify-between border-b-2 border-blue-500 mb-8">
              <div className="flex items-center">
                <img
                  src={CowImage}
                  alt="Vaca"
                  className="w-10 h-10 object-contain mr-2"
                />
                <h1 className="text-2xl font-bold text-blue-600 uppercase tracking-wide">
                  DISTRICARNES
                </h1>
              </div>
            </div>

            {/* NUEVA CARD HORIZONTAL: DATOS GENERALES */}
            <div className="bg-white border-2 border-blue-500 rounded-lg p-4 mb-6 print-compact-card">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center divide-y-2 md:divide-y-0 md:divide-x-2 divide-blue-200">
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-blue-600 uppercase mb-1">TIPO DE PAGO</span>
                  <span className="text-lg font-bold text-gray-800 capitalize">{formData.tipoPago}</span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-blue-600 uppercase mb-1">FECHA INICIO</span>
                  <span className="text-lg font-bold text-gray-800">
                    {formData.fechaInicio ? formatearFechaCorta(formData.fechaInicio) : '-'}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-blue-600 uppercase mb-1">VALOR PRODUCTO</span>
                  <span className="text-lg font-bold text-gray-800">
                    {formatearMoneda(formData.valorProducto || 0)}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-blue-600 uppercase mb-1">VALOR CUOTA</span>
                  <span className="text-lg font-bold text-green-600">
                    {formatearMoneda(formData.valorCuota || 0)}
                  </span>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-blue-600 uppercase mb-1">FECHA CREACIÓN</span>
                  {editandoFechaCreacion ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={fechaCreacionEditada}
                        onChange={(e) => setFechaCreacionEditada(e.target.value)}
                        className="px-2 py-1 text-sm border border-blue-500 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={handleGuardarFechaCreacion}
                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                        title="Guardar fecha de creación"
                      >
                        ✓
                      </button>
                      <button
                        onClick={handleCancelarEdicionFechaCreacion}
                        className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        title="Cancelar edición"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-gray-800">
                        {credito.fechaCreacion ? formatearFechaCorta(credito.fechaCreacion) : 
                         credito._id ? formatearFechaCorta(new Date(parseInt(credito._id.substring(0, 8), 10))) : '-'}
                      </span>
                      {!soloLectura && (
                        <button
                          onClick={handleEditarFechaCreacion}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="Editar fecha de creación"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* CARD PRINCIPAL: SOLICITANTE/CODEUDOR (Izquierda) y CUOTAS (Derecha) */}
            <div className="bg-white border-2 border-blue-500 rounded-lg p-4 md:p-6 flex flex-col lg:flex-row gap-6 print-compact-card">

              {/* COLUMNA IZQUIERDA: DATOS PERSONALES */}
              <div className="lg:w-1/3 flex flex-col gap-8 border-b-2 lg:border-b-0 lg:border-r-2 border-blue-100 pb-6 lg:pb-0 lg:pr-6">
                <div className="space-y-6">
                  <FormularioSolicitante
                    solicitante={formData.solicitante}
                    onChange={(field, value) => handleSolicitanteChange(field, value)}
                  />
                  <div className="border-t-2 border-blue-100 pt-6 print:hidden">
                    <FormularioCodeudor
                      codeudor={formData.codeudor}
                      onChange={(field, value) => handleCodeudorChange(field, value)}
                    />
                  </div>
                </div>
              </div>

              {/* COLUMNA DERECHA: GRILLA DE CUOTAS */}
              <div className="lg:w-2/3">
                
                {/* Panel de Edición Masiva de Fechas */}
                {mostrarPanelEdicion && (
                  <PanelEdicionFechas
                    cuotasNoPagadas={cuotasActualizadas.filter(c => !c.pagado)}
                    onGuardarCambios={handleGuardarEdicionMasiva}
                    onCancelar={handleCancelarEdicionMasiva}
                    modoEdicionFechas={modoEdicionFechas}
                    onModoEdicionChange={setModoEdicionFechas}
                  />
                )}

                <GrillaCuotas
                  formData={formData}
                  credito={credito}
                  cuotasActualizadas={cuotasActualizadas}
                  todasLasMultas={todasLasMultas}
                  obtenerNumeroCuotas={obtenerNumeroCuotas}
                  onPagar={soloLectura ? null : handleAbrirPago}
                  onNuevaMulta={soloLectura ? null : () => setMostrarModalNuevaMulta(true)}
                  onEditDate={soloLectura ? null : handleEditarFecha}
                  onEditarAbono={soloLectura ? null : handleEditarAbono}
                  onEliminarAbono={!soloLectura && user?.role === 'ceo' ? handleEliminarAbono : null}
                  onPagarMulta={soloLectura ? null : (multa) => handlePagarMulta(multa)}
                  onEditarMulta={soloLectura ? null : (multa) => handleEditarMulta(multa)}
                  onAbrirPanelEdicion={soloLectura ? null : handleAbrirPanelEdicion}
                  sinContenedor={true}
                  soloLectura={soloLectura}
                  procesando={procesandoPago}
                />
              </div>
            </div>
          </div>

          {/* Resumen General del Crédito */}
          <div className="mt-6">
            <ResumenCredito
              credito={credito}
              estado={estado}
              colorEstado={colorEstado}
              ETIQUETAS={ETIQUETAS}
              totalMultasCredito={totalMultasCredito}
              totalAbonos={totalAbonos}
              totalDescuentos={totalDescuentos}
              progreso={progreso}
              cuotasActualizadas={cuotasActualizadas}
              mostrarFormularioAbono={mostrarFormularioAbono}
              valorAbono={valorAbono}
              descripcionAbono={descripcionAbono}
              fechaAbono={fechaAbono}
              puedeRenovar={puedeRenovar}
              onMostrarSelectorEtiqueta={soloLectura ? null : () => setMostrarSelectorEtiqueta(!mostrarSelectorEtiqueta)}
              onMostrarFormularioAbono={soloLectura ? null : () => setMostrarFormularioAbono(true)}
              onValorAbonoChange={soloLectura ? null : (value) => setValorAbono(value)}
              onDescripcionAbonoChange={soloLectura ? null : (value) => setDescripcionAbono(value)}
              onFechaAbonoChange={soloLectura ? null : (value) => setFechaAbono(value)}
              onAgregarAbono={soloLectura ? null : handleAgregarAbono}
              onCancelarAbono={soloLectura ? null : () => {
                setMostrarFormularioAbono(false);
                setValorAbono('');
                setDescripcionAbono('');
                setFechaAbono(obtenerFechaHoy());
              }}
              onMostrarFormularioRenovacion={soloLectura ? null : () => setMostrarFormularioRenovacion(true)}
              onToggleDesactivado={(!soloLectura && !credito.renovado && (user?.role === 'ceo' || user?.role === 'administrador')) ? handleToggleDesactivado : null}
              soloLectura={soloLectura}
            />
          </div>

          {/* Notas */}
          <div className="mt-6 print:hidden">
            <ListaNotas
              notas={credito.notas}
              nuevaNota={nuevaNota}
              onNotaChange={soloLectura ? null : (value) => setNuevaNota(value)}
              onAgregarNota={soloLectura ? null : handleAgregarNota}
              onEliminarNota={!soloLectura && user?.role === 'ceo' ? handleEliminarNota : null}
              soloLectura={soloLectura}
            />
          </div>

          {/* Zona de Peligro */}
          {!soloLectura && user?.role === 'ceo' && (
            <div className="border-t pt-6 mt-6 print:hidden">
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-red-900 mb-2 flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Zona de Peligro
                </h3>
                <p className="text-sm text-red-700 mb-4">
                  Eliminar este crédito borrará permanentemente toda la información asociada, incluyendo pagos, multas, abonos y notas. Esta acción no se puede deshacer.
                </p>
                <button
                  onClick={handleEliminarCredito}
                  className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center"
                >
                  <Trash2 className="h-5 w-5 mr-2" />
                  Eliminar Crédito Permanentemente
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modales de Pago y Multa - Solo si no está en modo solo lectura */}
      {!soloLectura && (
        <>
          {cuotaParaPagar && (
            <ModalPago
              cuota={cuotaParaPagar}
              onClose={() => setCuotaParaPagar(null)}
              onConfirm={handleConfirmarPago}
              procesando={procesandoPago}
            />
          )}

          {mostrarModalNuevaMulta && (
            <ModalMulta
              onClose={() => setMostrarModalNuevaMulta(false)}
              onConfirm={handleConfirmarMulta}
              procesando={procesandoPago}
            />
          )}

          {multaParaPagar && (
            <ModalPagoMulta
              multa={multaParaPagar}
              onClose={() => setMultaParaPagar(null)}
              onConfirm={handleConfirmarPagoMulta}
              procesando={procesandoPago}
            />
          )}

          {multaParaEditar && (
            <ModalEditarMulta
              multa={multaParaEditar}
              onClose={() => setMultaParaEditar(null)}
              onGuardar={handleGuardarEdicionMulta}
              onEliminar={user?.role === 'ceo' ? handleEliminarMulta : null}
              procesando={procesandoPago}
            />
          )}

          {/* Modal para editar fecha */}
          {mostrarEditorFecha && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
              <div className="bg-white rounded-lg p-6 w-96 shadow-2xl">
                <EditorFecha
                  cuota={cuotasActualizadas.find(c => c.nroCuota === mostrarEditorFecha)}
                  credito={creditoActualizado}
                  nuevaFecha={nuevaFecha}
                  onFechaChange={setNuevaFecha}
                  onGuardar={handleGuardarFecha}
                  onCancelar={handleCancelarEdicionFecha}
                  modoEdicion={modoEdicionFechas}
                />
              </div>
            </div>
          )}

          {/* Modal de Renovación */}
          {mostrarFormularioRenovacion && (
            <RenovacionForm
              // Pasamos el crédito con cuotasActualizadas para que la deuda pendiente
              // se calcule usando los abonos aplicados (abonoAplicado) por cuota
              creditoAnterior={{ ...creditoActualizado, cuotas: cuotasActualizadas }}
              cliente={cliente}
              onSubmit={handleRenovar}
              onClose={() => setMostrarFormularioRenovacion(false)}
            />
          )}

          {/* Modal para editar abono (pago) */}
          {abonoEnEdicion && (
            <ModalEditarAbono
              abono={abonoEnEdicion}
              maxCuotas={obtenerNumeroCuotas(formData.tipoPago)}
              onClose={() => setAbonoEnEdicion(null)}
              onConfirm={handleGuardarEdicionAbono}
              onDelete={user?.role === 'ceo' ? () => {
                handleEliminarAbono(abonoEnEdicion.id);
                setAbonoEnEdicion(null);
              } : null}
            />
          )}
        </>
      )}
    </div>
  );
};

export default CreditoDetalle;

const ModalEditarAbono = ({ abono, maxCuotas, onClose, onConfirm, onDelete }) => {
  const [valor, setValor] = useState(abono.valor || '');
  const [fecha, setFecha] = useState(abono.fecha ? abono.fecha.split('T')[0] : obtenerFechaHoy());
  const [descripcion, setDescripcion] = useState(abono.descripcion || '');

  // Intentar deducir nroCuota si no viene explícito
  const obtenerCuotaInicial = () => {
    if (abono.nroCuota) return abono.nroCuota;
    const match = abono.descripcion ? abono.descripcion.match(/(?:Cuota|cuota)\s*#(\d+)/) : null;
    return match ? parseInt(match[1]) : 1;
  };

  const [nroCuota, setNroCuota] = useState(obtenerCuotaInicial());

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!valor || parseFloat(valor) <= 0) {
      alert('Ingrese un valor válido');
      return;
    }
    // Actualizar descripción si cambia la cuota y la descripción era genérica
    let descFinal = descripcion;
    if (descFinal.includes('Cuota #')) {
      descFinal = descFinal.replace(/Cuota #\d+/, `Cuota #${nroCuota}`);
    } else if (descFinal.includes('cuota #')) {
      descFinal = descFinal.replace(/cuota #\d+/, `cuota #${nroCuota}`);
    }

    onConfirm({ valor, fecha, descripcion: descFinal, nroCuota });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 w-96 shadow-2xl">
        <h3 className="text-lg font-bold text-blue-600 mb-4">Editar abono</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Valor del abono</label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full border rounded p-2"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border rounded p-2"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Aplicar a Cuota #</label>
            <select
              value={nroCuota}
              onChange={(e) => setNroCuota(e.target.value)}
              className="w-full border rounded p-2"
            >
              {Array.from({ length: maxCuotas || 10 }, (_, i) => i + 1).map(num => (
                <option key={num} value={num}>Cuota #{num}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Descripción</label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full border rounded p-2"
              placeholder="Ej: Abono cuota #1"
            />
          </div>
          <div className="flex flex-wrap justify-center sm:justify-between items-center gap-3 pt-4 border-t border-gray-100">
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center gap-2 border border-red-100 transition-colors w-full sm:w-auto order-3 sm:order-1"
                title="Eliminar pago"
              >
                <Trash2 className="h-4 w-4" />
                <span className="font-semibold text-sm">Eliminar</span>
              </button>
            )}
            <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2 justify-center sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold text-sm transition-colors flex-1 sm:flex-none"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm transition-all shadow-sm flex-1 sm:flex-none"
              >
                Guardar cambios
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const ModalPago = ({ cuota, onClose, onConfirm, procesando = false }) => {
  const [valor, setValor] = useState(cuota.valorPendiente || '');
  const [fecha, setFecha] = useState(obtenerFechaHoy());
  const [descripcion, setDescripcion] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (procesando) return; // Prevenir múltiples envíos
    if (!valor || valor <= 0) return alert('Ingrese un valor válido');
    onConfirm({ valor, fecha, descripcion });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 w-96 shadow-2xl">
        <h3 className="text-lg font-bold text-blue-600 mb-4">Pagar Cuota #{cuota.nroCuota}</h3>
        <p className="text-sm text-gray-600 mb-4">
          Pendiente: <span className="font-bold text-red-600">{formatearMoneda(cuota.valorPendiente)}</span>
        </p>
        {procesando && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
            <span className="text-sm text-blue-700 font-medium">Procesando pago...</span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Valor a pagar</label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full border rounded p-2"
              autoFocus
              disabled={procesando}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Fecha de pago</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border rounded p-2"
              disabled={procesando}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Descripción (Opcional)</label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full border rounded p-2"
              placeholder="Ej: Abono parcial"
              disabled={procesando}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold text-sm transition-colors"
              disabled={procesando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm min-w-[120px]"
              disabled={procesando}
            >
              {procesando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span className="text-xs">Procesando...</span>
                </>
              ) : (
                'Confirmar Pago'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ModalPagoMulta = ({ multa, onClose, onConfirm, procesando = false }) => {
  const { multa: multaData, valorPendiente } = multa;
  const [valor, setValor] = useState(valorPendiente || '');
  const [fecha, setFecha] = useState(obtenerFechaHoy());
  const [descripcion, setDescripcion] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (procesando) return;
    if (!valor || parseFloat(valor) <= 0) return alert('Ingrese un valor válido');
    if (parseFloat(valor) > valorPendiente) {
      return alert(`El valor a pagar no puede ser mayor al pendiente (${formatearMoneda(valorPendiente)})`);
    }
    onConfirm({ valor, fecha, descripcion });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 w-96 shadow-2xl">
        <h3 className="text-lg font-bold text-blue-600 mb-4">Pagar Multa</h3>
        <p className="text-sm text-gray-600 mb-4">
          Pendiente: <span className="font-bold text-red-600">${formatearMoneda(valorPendiente)}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Valor a pagar</label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full border rounded p-2"
              autoFocus
              min="0"
              max={valorPendiente}
              disabled={procesando}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Fecha de pago</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border rounded p-2"
              disabled={procesando}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Descripción (Opcional)</label>
            <input
              type="text"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              className="w-full border rounded p-2"
              placeholder="Ej: Abono parcial"
              disabled={procesando}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold text-sm transition-colors"
              disabled={procesando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm min-w-[120px]"
              disabled={procesando}
            >
              {procesando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span className="text-xs">Procesando...</span>
                </>
              ) : (
                'Confirmar Pago'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ModalMulta = ({ onClose, onConfirm, procesando = false }) => {
  const [valor, setValor] = useState('');
  const [fecha, setFecha] = useState(obtenerFechaHoy());
  const [motivo, setMotivo] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (procesando) return;
    if (!valor || valor <= 0) return alert('Ingrese un valor válido');
    onConfirm({ valor, fecha, motivo });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 w-96 shadow-2xl">
        <h3 className="text-lg font-bold text-red-600 mb-4">Nueva Multa</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Valor Multa</label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full border rounded p-2"
              autoFocus
              disabled={procesando}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border rounded p-2"
              disabled={procesando}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Motivo</label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full border rounded p-2"
              disabled={procesando}
            />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold text-sm transition-colors"
              disabled={procesando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm min-w-[120px]"
              disabled={procesando}
            >
              {procesando ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span className="text-xs">Procesando...</span>
                </>
              ) : (
                'Crear Multa'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const ModalEditarMulta = ({ multa, onClose, onGuardar, onEliminar, procesando = false }) => {
  const [valor, setValor] = useState(multa.valor || '');
  const [fecha, setFecha] = useState(multa.fecha || obtenerFechaHoy());
  const [motivo, setMotivo] = useState(multa.motivo || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (procesando) return;
    if (!valor || parseFloat(valor) <= 0) return alert('Ingrese un valor válido');
    onGuardar(valor, fecha, motivo);
  };

  const handleEliminar = () => {
    if (procesando || !onEliminar) return;
    onEliminar(multa.id);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-lg p-6 w-96 shadow-2xl">
        <h3 className="text-lg font-bold text-blue-600 mb-4">Editar Multa</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Valor de la multa</label>
            <input
              type="number"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full border rounded p-2"
              autoFocus
              min="0"
              step="0.01"
              disabled={procesando}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full border rounded p-2"
              disabled={procesando}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Motivo</label>
            <input
              type="text"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full border rounded p-2"
              placeholder="Ej: Retraso en pago"
              disabled={procesando}
            />
          </div>
          <div className="flex flex-wrap justify-between items-center gap-3 pt-4 border-t border-gray-100">
            {onEliminar && (
              <button
                type="button"
                onClick={handleEliminar}
                className="px-4 py-2 bg-red-200 text-red-600 border border-red-100 rounded-lg hover:bg-red-100 font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all min-w-[100px]"
                disabled={procesando}
              >
                {procesando ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                    <span className="text-xs">Procesando...</span>
                  </>
                ) : (
                  'Eliminar'
                )}
              </button>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-semibold text-sm transition-colors"
                disabled={procesando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-sm min-w-[100px]"
                disabled={procesando}
              >
                {procesando ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span className="text-xs">Procesando...</span>
                  </>
                ) : (
                  'Guardar'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
