import bcrypt from 'bcrypt';
import prisma from '../utils/prisma.js';
import { generateAccessToken, generateRefreshToken, revokeRefreshToken } from '../utils/jwt.js';
import { ConflictError, UnauthorizedError } from '../utils/errors.js';

const SALT_ROUNDS = 12;

function excludePassword(user) {
  const { password, ...rest } = user;
  return rest;
}

export async function register(email, password, firstName, lastName) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new ConflictError('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: { email, password: hashedPassword, firstName, lastName },
  });

  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = await generateRefreshToken(user.id);

  return { user: excludePassword(user), accessToken, refreshToken };
}

export async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const accessToken = generateAccessToken(user.id, user.role);
  const refreshToken = await generateRefreshToken(user.id);

  return { user: excludePassword(user), accessToken, refreshToken };
}

export async function refresh(refreshToken) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!stored || stored.expiresAt < new Date()) {
    if (stored) {
      await revokeRefreshToken(refreshToken);
    }
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  // Token rotation: delete old, issue new
  await revokeRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  const newAccessToken = generateAccessToken(user.id, user.role);
  const newRefreshToken = await generateRefreshToken(user.id);

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken) {
  await revokeRefreshToken(refreshToken);
}

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return excludePassword(user);
}
