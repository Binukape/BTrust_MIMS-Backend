import { badRequest } from './errors.js';

export function str(body, name, { min = 1, max = 255, label = name } = {}) {
  const value = body?.[name];
  if (typeof value !== 'string') throw badRequest(`${label} is required`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw badRequest(`${label} must be at least ${min} characters`);
  if (trimmed.length > max) throw badRequest(`${label} must be at most ${max} characters`);
  return trimmed;
}

export function id(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`${label} must be a positive whole number`);
  return n;
}

export function money(value, label = 'amount') {
  const text = typeof value === 'number' ? String(value) : value;
  if (typeof text !== 'string' || !/^\d{1,13}(\.\d{1,2})?$/.test(text.trim())) {
    throw badRequest(`${label} must be a positive amount with at most 2 decimals`);
  }
  const cleaned = text.trim();
  if (Number(cleaned) <= 0) throw badRequest(`${label} must be greater than zero`);
  return cleaned;
}

export function isoDate(value, label = 'date') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${label} must be in YYYY-MM-DD format`);
  }
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
    throw badRequest(`${label} is not a real date`);
  }
  return value;
}

export function optionalDate(value, label) {
  if (value === undefined || value === null || value === '') return null;
  return isoDate(value, label);
}

export function nic(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!/^(\d{12}|\d{9}[VvXx])$/.test(v)) {
    throw badRequest('NIC must be 12 digits, or 9 digits followed by V or X');
  }
  return v.toUpperCase();
}

export function phone(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!/^[0-9+\-\s]{7,20}$/.test(v)) throw badRequest('Phone number must be 7-20 digits');
  return v;
}

export function username(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(v)) {
    throw badRequest('Username must be 3-50 characters: letters, digits, dot, dash or underscore');
  }
  return v;
}

export function password(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 100) {
    throw badRequest('Password must be 8-100 characters');
  }
  return value;
}
