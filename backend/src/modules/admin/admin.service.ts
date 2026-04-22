import { prisma } from "@/lib/db";
import { AppError } from "@/middlewares/error.middleware";
import bcrypt from "bcryptjs";
import { ChangePasswordInput, CreateUserInput, UpdateUserInput } from "./admin.shema.js";

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
};

export class AdminService {
  static async findAll() {
    return prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: "desc" },
    });
  }

  static async findById(id: string) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!user) throw new AppError(404, "Usuario no encontrado");
    return user;
  }

  static async create(input: CreateUserInput) {
    const exists = await prisma.user.findUnique({
      where: { email: input.email },
    });
    if (exists) throw new AppError(409, "El email ya está registrado");

    const hashedPassword = await bcrypt.hash(input.password, 12);

    return prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password: hashedPassword,
        role: input.role,
      },
      select: userSelect,
    });
  }

  static async update(id: string, input: UpdateUserInput) {
    await this.findById(id);

    return prisma.user.update({
      where: { id },
      data: input,
      select: userSelect,
    });
  }

  static async changePassword(id: string, input: ChangePasswordInput) {
    await this.findById(id);
    const hashedPassword = await bcrypt.hash(input.newPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });

    return { message: "Constraseña actualizada correctamente" };
  }

  private static async validateAdminRemoval(id: string) {
    const user = await this.findById(id);

    if (user.role === "ADMIN") {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", isActive: true },
      });

      if (adminCount <= 1) {
        throw new AppError(400, "No se puede eliminar al único adminitrador");
      }
    }

    return user;
  }

  static async delete(id: string) {
    await this.validateAdminRemoval(id);
    return await prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  static async deleteDefinitive(id: string) {
    await this.validateAdminRemoval(id);
    return await prisma.user.delete({ where: { id } });
  }
}
