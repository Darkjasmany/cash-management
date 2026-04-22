import type { NextFunction, Request, Response } from "express";
import { LoginInput, RegisterInput } from "./auth.schema";
import { AuthService } from "./auth.service";

export class AuthController {
  static login = async (req: Request<{}, {}, LoginInput>, res: Response, next: NextFunction) => {
    try {
      const result = await AuthService.login(req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  static register = async (
    req: Request<{}, {}, RegisterInput>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = await AuthService.register(req.body);
      res.status(201).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  };

  static profile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // req.user viene del middleware de auth
      const user = await AuthService.getProfile(req.user!.id);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  };
}
