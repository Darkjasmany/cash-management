import { authenticate } from "@/middlewares/auth.middleware";
import { validateBody } from "@/middlewares/validate.middleware";
import { Router } from "express";
import { AuthController } from "./auth.controller";
import { loginSchema } from "./auth.schema";

const router: Router = Router();

// Públicas
router.post("/login", validateBody(loginSchema), AuthController.login);

// Privadas - solo ADMIN puede crear usuarios, pero cualquier usuario autenticado puede ver su perfil
router.post("/register", authenticate, validateBody(loginSchema), AuthController.register);

router.get("/profile", authenticate, AuthController.profile);

export default router;
