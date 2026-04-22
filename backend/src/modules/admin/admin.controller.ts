import type { NextFunction, Request, Response } from "express";
import { AdminService } from "./admin.service.js";
import { ChangePasswordInput, CreateUserInput, UpdateUserInput } from "./admin.shema.js";

type AdminParams = {
  id: string;
};

export class AdminController {
  static getAll = async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const users = await AdminService.findAll();
      res.json({ success: true, data: users });
    } catch (error) {
      next(error);
    }
  };

  static getById = async (req: Request<AdminParams>, res: Response, next: NextFunction) => {
    try {
      const user = await AdminService.findById(req.params.id);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  };

  static create = async (
    req: Request<{}, {}, CreateUserInput>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = await AdminService.create(req.body);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  };

  static update = async (
    req: Request<AdminParams, {}, UpdateUserInput>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const user = await AdminService.update(req.params.id, req.body);
      res.json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  };

  static changePassword = async (
    req: Request<AdminParams, {}, ChangePasswordInput>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const result = await AdminService.changePassword(req.params.id, req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  static delete = async (req: Request<AdminParams, {}, {}>, res: Response, next: NextFunction) => {
    try {
      await AdminService.delete(req.params.id);
      res.json({ success: true, message: "Usuario eliminado correctamente" });
    } catch (error) {
      next(error);
    }
  };

  static deleteDefinite = async (
    req: Request<AdminParams, {}, {}>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      await AdminService.deleteDefinitive(req.params.id);
      res.json({ success: true, message: "Usuario eliminado correctamente" });
    } catch (error) {
      next(error);
    }
  };
}
