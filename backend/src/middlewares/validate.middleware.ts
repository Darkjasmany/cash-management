import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
// import type { ZodSchema } from "zod"; //Ya esta en deshuso, pero la dejo para que se vea el tipo correcto del schema que se le pasa a la función
// (schema: ZodSchema)

export const validateBody =
  (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success)
      return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });

    req.body = result.data; // Sobrescribimos el body con los datos validados y transformados para Zod
    next();
  };

export const validateParams =
  (schema: z.ZodTypeAny) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success)
      return res.status(400).json({ success: false, errors: result.error.flatten().fieldErrors });

    next();
  };
