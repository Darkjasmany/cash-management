// import { AppError } from "@/middlewares/error.middleware";
import { AppError } from "@/middlewares/error.middleware";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../../lib/db";
import { LoginInput, RegisterInput } from "./auth.schema";

// Tipo del payload del JWT
export type JwtPayload = {
  id: string;
  role: string;
};

// Tipo de respuesta del login
type LoginResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  token: string;
};

type RegisterResponse = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
};

export class AuthService {
  // Equivalente a generarJWT
  private static generateToken(payload: JwtPayload): string {
    return jwt.sign(payload, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
    } as jwt.SignOptions);
  }

  // Equivalente a tu hashPassword del BeforeSave de Sequelize
  // En Prisma no hay hooks, lo haces manualmente en el service
  private static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12); // Cost Factor o Rondas de Salto Indica cuántas veces se ejecutará el algoritmo de hashing 12 es el estándar actual recomendado: es lo suficientemente lento para que un hacker no pueda adivinar contraseñas por fuerza bruta, pero lo suficientemente rápido para que tu usuario no note demora al registrarse
  }

  // Equivalente a tu checkPassword
  private static async verifyPassword(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  static async login(input: LoginInput): Promise<LoginResponse> {
    // Prisma equivale a: User.findOne({ where: { email } })
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (!user) throw new AppError(401, "Credenciales inválidas");

    const isValid = await this.verifyPassword(input.password, user.password);
    if (!isValid) throw new AppError(401, "Credenciales inválidas");

    const token = this.generateToken({ id: user.id, role: user.role });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      token,
    };
  }

  static async register(input: RegisterInput): Promise<RegisterResponse> {
    const exists = await prisma.user.findUnique({
      where: {
        email: input.email,
      },
    });
    if (exists) throw new AppError(409, "El email ya está registrado");

    // En Sequelize tenías BeforeSave para hashear
    // En Prisma lo haces aquí antes del create
    const hashedPassword = await this.hashPassword(input.password);

    // Equivale a: new User(req.body) + user.save()
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role,
      },
      // select evita devolver el password — más elegante que delete user.password
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
    return user;
  }

  static async getProfile(userId: string): Promise<UserProfile> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) throw new AppError(404, "Usuario no encontrado");
    return user;
  }
}
