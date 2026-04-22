import { authenticate, authorize } from "@/middlewares/auth.middleware.js";
import { validateBody } from "@/middlewares/validate.middleware.js";
import { Router } from "express";
import { AdminController } from "./admin.controller.js";
import { changePasswordSchema, createUserSchema, updateUserSchema } from "./admin.shema.js";

const router: Router = Router();

// Todas las rutas solo para ADMIN
router.use(authenticate, authorize("ADMIN"));

router.get("/", AdminController.getAll);
router.get("/:id", AdminController.getById);
router.post("/", validateBody(createUserSchema), AdminController.create);
router.patch("/:id", validateBody(updateUserSchema), AdminController.update);
router.patch("/:id/password", validateBody(changePasswordSchema), AdminController.changePassword);
router.patch("/:id/deleted", AdminController.delete);
router.delete("/:id", AdminController.deleteDefinite);

export default router;
