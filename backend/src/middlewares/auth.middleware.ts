import { JwtPayload } from "@/modules/auth/auth.service";
import jwt from "jsonwebtoken";

import type { NextFunction, Request, Response } from "express";
import { AppError } from "./error.middleware";

// Extiendes el tipo Request de Express para agregar user
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload; // user? usuario es opcional porque no siempre estará presente, solo después de pasar por el middleware de autenticación
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer")) return next(new AppError(401, "No autorizado"));

  const token = authHeader.split(" ")[1]; // separa "Bearer" del token

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload; // Verifica el token y obtiene el payload. El "as JwtPayload" es para decirle a TypeScript que el resultado tendrá esa forma
    req.user = payload; // Guarda el payload en req.user para que esté disponible en los controladores
    next();
  } catch (error) {
    return next(new AppError(401, "Token inválido o expirado"));
  }
};

// Middleware de autorización por rol
export const authorize =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      return next(new AppError(403, "No tienes permisos para esta acción"));
    next();
  };
