import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

/**
 * Configuración de CORS
 */
export const corsOptions = {
  origin: [
    process.env.CLIENT_URL,
    ...Array.from({ length: 100 }, (_, i) => `http://localhost:${5173 + i}`),
    'http://localhost:3000',
    'https://prestamos-juan-clone.vercel.app'
  ].filter(Boolean),
  credentials: true,
  optionsSuccessStatus: 200
};

/**
 * Rate limiting para prevenir abuso
 */
export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Aumentado para desarrollo
  message: { error: 'Demasiadas solicitudes desde esta IP, intenta de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiting más estricto para rutas de autenticación
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Aumentado para evitar bloqueos durante desarrollo/pruebas
  message: { error: 'Demasiados intentos de autenticación, intenta de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // En desarrollo, permitir más intentos
    return process.env.NODE_ENV === 'development';
  }
});

/**
 * Aplicar middleware de seguridad
 */
export const applySecurityMiddleware = (app) => {
  // Helmet para seguridad HTTP
  app.use(helmet());

  // CORS
  app.use(cors(corsOptions));

  // Rate limiting general
  app.use('/api/', limiter);
};

