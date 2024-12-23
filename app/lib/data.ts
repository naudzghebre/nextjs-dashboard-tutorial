import { db } from '@vercel/postgres';
import {
  CustomerField,
  CustomersTableType,
  InvoiceForm,
  InvoicesTable,
  LatestInvoiceRaw,
  Revenue,
} from './definitions';
import { formatCurrency } from './utils';

export async function fetchRevenue() {
  const client = await db.connect();

  // We artificially delay a response for demo purposes.
  // Don't do this in production :)
  console.log('Fetching revenue data...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  try {
    await client.sql`BEGIN`;
    const data = await client.sql<Revenue>`SELECT * FROM revenue`;
    await client.sql`COMMIT`;
    return data.rows;
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Database Error:', error);
    throw new Error('Failed to fetch revenue data.');
  } finally {
    client.release();
  }
}

export async function fetchLatestInvoices() {
  const client = await db.connect();

  try {
    await client.sql`BEGIN`;
    const data = await client.sql<LatestInvoiceRaw>`
      SELECT invoices.amount, customers.name, customers.image_url, customers.email, invoices.id
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      ORDER BY invoices.date DESC
      LIMIT 5`;
    await client.sql`COMMIT`;

    return data.rows.map((invoice) => ({
      ...invoice,
      amount: formatCurrency(invoice.amount),
    }));
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Database Error:', error);
    throw new Error('Failed to fetch latest invoices.');
  } finally {
    client.release();
  }
}

export async function fetchCardData() {
  const client = await db.connect();

  try {
    await client.sql`BEGIN`;
    const [invoiceCount, customerCount, invoiceStatus] = await Promise.all([
      client.sql`SELECT COUNT(*) FROM invoices`,
      client.sql`SELECT COUNT(*) FROM customers`,
      client.sql`SELECT
        SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS "paid",
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) AS "pending"
        FROM invoices`,
    ]);
    await client.sql`COMMIT`;

    return {
      numberOfInvoices: Number(invoiceCount.rows[0].count ?? '0'),
      numberOfCustomers: Number(customerCount.rows[0].count ?? '0'),
      totalPaidInvoices: formatCurrency(invoiceStatus.rows[0].paid ?? '0'),
      totalPendingInvoices: formatCurrency(
        invoiceStatus.rows[0].pending ?? '0'
      ),
    };
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Database Error:', error);
    throw new Error('Failed to fetch card data.');
  } finally {
    client.release();
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  query: string,
  currentPage: number
) {
  const client = await db.connect();
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  try {
    await client.sql`BEGIN`;
    const data = await client.sql<InvoicesTable>`
      SELECT
        invoices.id,
        invoices.amount,
        invoices.date,
        invoices.status,
        customers.name,
        customers.email,
        customers.image_url
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
      ORDER BY invoices.date DESC
      LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
    `;
    await client.sql`COMMIT`;
    return data.rows;
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoices.');
  } finally {
    client.release();
  }
}

export async function fetchInvoicesPages(query: string) {
  const client = await db.connect();

  try {
    await client.sql`BEGIN`;
    const count = await client.sql`
      SELECT COUNT(*)
      FROM invoices
      JOIN customers ON invoices.customer_id = customers.id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`} OR
        invoices.amount::text ILIKE ${`%${query}%`} OR
        invoices.date::text ILIKE ${`%${query}%`} OR
        invoices.status ILIKE ${`%${query}%`}
    `;
    await client.sql`COMMIT`;

    const totalPages = Math.ceil(Number(count.rows[0].count) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Database Error:', error);
    throw new Error('Failed to fetch total number of invoices.');
  } finally {
    client.release();
  }
}

export async function fetchInvoiceById(id: string) {
  const client = await db.connect();

  try {
    await client.sql`BEGIN`;
    const data = await client.sql<InvoiceForm>`
      SELECT
        invoices.id,
        invoices.customer_id,
        invoices.amount,
        invoices.status
      FROM invoices
      WHERE invoices.id = ${id};
    `;
    await client.sql`COMMIT`;

    return data.rows.map((invoice) => ({
      ...invoice,
      amount: invoice.amount / 100,
    }))[0];
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Database Error:', error);
    throw new Error('Failed to fetch invoice.');
  } finally {
    client.release();
  }
}

export async function fetchCustomers() {
  const client = await db.connect();

  try {
    await client.sql`BEGIN`;
    const data = await client.sql<CustomerField>`
      SELECT
        id,
        name
      FROM customers
      ORDER BY name ASC
    `;
    await client.sql`COMMIT`;
    return data.rows;
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Database Error:', error);
    throw new Error('Failed to fetch all customers.');
  } finally {
    client.release();
  }
}

export async function fetchFilteredCustomers(query: string) {
  const client = await db.connect();

  try {
    await client.sql`BEGIN`;
    const data = await client.sql<CustomersTableType>`
      SELECT
        customers.id,
        customers.name,
        customers.email,
        customers.image_url,
        COUNT(invoices.id) AS total_invoices,
        SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
        SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
      FROM customers
      LEFT JOIN invoices ON customers.id = invoices.customer_id
      WHERE
        customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
      GROUP BY customers.id, customers.name, customers.email, customers.image_url
      ORDER BY customers.name ASC
    `;
    await client.sql`COMMIT`;

    return data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Database Error:', error);
    throw new Error('Failed to fetch customer table.');
  } finally {
    client.release();
  }
}
