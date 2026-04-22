// import { authenticate } from "@/middlewares/auth.middleware.js";
import { authenticate } from "@/middlewares/auth.middleware.js";
import { validateBody } from "@/middlewares/validate.middleware.js";
import { Router } from "express";
import { AuthController } from "./auth.controller.js";
import { loginSchema } from "./auth.schema.js";

const router: Router = Router();

// Públicas
router.post("/login", validateBody(loginSchema), AuthController.login);

// Privadas - solo ADMIN puede crear usuarios, pero cualquier usuario autenticado puede ver su perfil
router.post("/register", authenticate, validateBody(loginSchema), AuthController.register);

router.get("/profile", authenticate, AuthController.profile);

export default router;
