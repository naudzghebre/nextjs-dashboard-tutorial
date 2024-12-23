'use server';
import { z } from 'zod';
import { db } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { createUser } from '@/auth';

export async function signUp(
  prevState: string | undefined,
  formData: FormData
) {
  const parsedCredentials = z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
    })
    .safeParse({
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
    });

  if (!parsedCredentials.success) {
    return 'Invalid credentials';
  }

  try {
    const { name, email, password } = parsedCredentials.data;
    await createUser(name, email, password);
    redirect('/login?message=Account created successfully');
  } catch (error) {
    return 'Failed to create user';
  }
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater than $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status.',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];

  let client;
  try {
    client = await db.connect();
    await client.sql`
      INSERT INTO invoices (customer_id, amount, status, date)
            VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
        `;
    await client.sql`COMMIT`;
  } catch (error) {
    console.error(error);
    return {
      message: 'Database Error: Failed to Create Invoice.',
    };
  } finally {
    client?.release();
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData
) {
  const validatedFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice.',
    };
  }

  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;

  let client;
  try {
    client = await db.connect();
    await client.sql`
        UPDATE invoices
        SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
        WHERE id = ${id}
      `;
  } catch (error) {
    console.error(error);
    return {
      message: 'Database Error: Failed to Update Invoice.',
    };
  } finally {
    client?.release();
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  let client;
  try {
    client = await db.connect();
    await client.sql`DELETE FROM invoices WHERE id = ${id}`;
  } catch (error) {
    console.error(error);
    return {
      message: 'Database Error: Failed to Delete Invoice.',
    };
  } finally {
    client?.release();
  }
  revalidatePath('/dashboard/invoices');
}
