import { AppError } from "@/middlewares/error.middleware";
import type { NextFunction, Request, Response } from "express";
import { CutService } from "./cut.service";

export class CutController {
  static process = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fechaCorte } = req.body;
      const user = (req as any).usuario;

      const result = await CutService.processCut(fechaCorte, user.id, user.name || user.username);

      res.status(200).json({
        success: true,
        message: `Proceso completado. ${result.totalRegistros} clientes con deuda.`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  static getActive = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(200, parseInt(req.query.limit as string) || 50);

      const result = await CutService.getActiveCut(page, limit);

      if (!result) {
        throw new AppError(404, "No existe un corte activo. Procesa una fecha de corte primero.");
      }

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };

  static downloadTxt = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const content = await CutService.generateTxt();
      const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const fileName = `deudas_${date}.txt`;

      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.status(200).send(content);
    } catch (error) {
      next(error);
    }
  };

  static downloadExcel = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const buffer = await CutService.generateExcel();
      const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const fileName = `deudas_${date}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.status(200).send(buffer);
    } catch (error) {
      next(error);
    }
  };
}
