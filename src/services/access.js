import { pool } from "../config/db.js";

export async function customerOwnsAccount(customerId, accountId) {
     const [rows] = await pool.query(
        `SELECT 1
         FROM ACCOUNT_HOLDER
         WHERE customer_id = ?
           AND account_id = ?`,
        [customerId, accountId]
    );

    return rows.length > 0;
}

export async function agentCanAccessAccount(agentId, accountId) {
    const [rows] = await pool.query(
        `SELECT 1
         FROM ACCOUNT_HOLDER ah
         JOIN CUSTOMER c
           ON c.customer_id = ah.customer_id
         WHERE ah.account_id = ?
           AND c.agent_id = ?`,
        [accountId, agentId]
    );

    return rows.length > 0;
}

export async function getFdAccountId(fdId) {
    const [rows] = await pool.query(
        `SELECT account_id
         FROM FIXED_DEPOSIT
         WHERE fd_id = ?`,
        [fdId]
    );

    //Note:
    // rows[0] =  { account_id: 25 }
    // rows[0].account_id  =  25


    return rows[0]?.account_id ?? null; // ?. if exist then access
}

export async function customerOwnsFd(customerId, fdId) {
    const accountId = await getFdAccountId(fdId);

    if (accountId === null) {
        return false;
    }

    return customerOwnsAccount(customerId, accountId);
}



export async function agentCanAccessFd(agentId, fdId) {
    const accountId = await getFdAccountId(fdId);

    if (accountId === null) {
        return false;
    }

    return agentCanAccessAccount(agentId, accountId);
}