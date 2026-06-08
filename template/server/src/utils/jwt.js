import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import prisma from './prisma.js';

const ACCESS_SECRET = process.env.JWT_SECRET || 'dev-access-secret';
const ACCESS_EXPIRY = process.env.JWT_EXPIRY || '15m';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || 'dev-refresh-secret';
const REFRESH_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

function parseExpiryToMs(expiry) {
  const match = expiry.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return value * multipliers[unit];
}

export function generateAccessToken(userId, role) {
  return jwt.sign({ userId, role }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRY });
}

export async function generateRefreshToken(userId) {
  const token = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + parseExpiryToMs(REFRESH_EXPIRY));

  await prisma.refreshToken.create({
    data: { token, userId, expiresAt },
  });

  return token;
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

export async function revokeRefreshToken(token) {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function revokeAllUserRefreshTokens(userId) {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

export async function cleanExpiredTokens() {
  const result = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
