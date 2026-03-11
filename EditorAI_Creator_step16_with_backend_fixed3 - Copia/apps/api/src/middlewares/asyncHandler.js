/**
 * Wrapper para rotas async no Express (evita try/catch repetido)
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
