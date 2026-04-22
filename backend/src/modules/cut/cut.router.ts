import { authenticate } from "@/middlewares/auth.middleware";
import { validateBody } from "@/middlewares/validate.middleware";
import { Router } from "express";
import { CutController } from "./cut.controller";
import { processSchema } from "./cut.schema";

const router: Router = Router();

router.use(authenticate);

router.post("/procesar", validateBody(processSchema), CutController.process);
router.get("/activo", CutController.getActive);
router.get("/descargar/txt", CutController.downloadTxt);
router.get("/descargar/xlsx", CutController.downloadExcel);

export default router;
