import { HttpError } from '../utils/errors.js';

function duplicateMessage(sqlMessage = '') {
  if (sqlMessage.includes('nic')) return 'That NIC number is already registered';
  if (sqlMessage.includes('username')) return 'That username is already taken';
  if (sqlMessage.includes('account_number')) return 'Account number clash, please try again';
  if (sqlMessage.includes('plan_name')) return 'That plan name already exists';
  return 'A record with the same unique value already exists';
}

export function notFoundHandler(_req, res) {
  res.status(404).json({ message: 'Route not found' });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError || (err.status && !err.code)) {
    return res.status(err.status).json({ message: err.message });
  }

  switch (err.errno) {
    case 1644:
      return res.status(400).json({ message: err.sqlMessage });
    case 1062:
      return res.status(409).json({ message: duplicateMessage(err.sqlMessage) });
    case 1451:
      return res.status(409).json({ message: 'This record cannot be deleted because other records depend on it' });
    case 1452:
      return res.status(400).json({ message: 'A referenced record does not exist' });
    case 3819:
      return res.status(400).json({ message: 'The balance cannot become negative' });
    default:
      break;
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Request body is not valid JSON' });
  }

  console.error(err);
  return res.status(500).json({ message: 'Something went wrong on the server' });
}
