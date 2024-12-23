import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { db } from '@vercel/postgres';
import type { User } from '@/app/lib/definitions';
import bcrypt from 'bcrypt';

export async function createUser(
  name: string,
  email: string,
  password: string
) {
  const client = await db.connect();

  try {
    await client.sql`BEGIN`;
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await client.sql`
      INSERT INTO users (name, email, password)
      VALUES (${name}, ${email}, ${hashedPassword})
      RETURNING id, name, email
    `;
    await client.sql`COMMIT`;
    return result.rows[0];
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Failed to create user:', error);
    throw new Error('Failed to create user.');
  } finally {
    client.release();
  }
}

async function getUser(email: string): Promise<User | undefined> {
  const client = await db.connect();

  try {
    await client.sql`BEGIN`;
    const user = await client.sql<User>`
      SELECT * FROM users WHERE email=${email}
    `;
    await client.sql`COMMIT`;
    return user.rows[0];
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Failed to fetch user:', error);
    throw new Error('Failed to fetch user.');
  } finally {
    client.release();
  }
}

export const { auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      async authorize(credentials) {
        const parsedCredentials = z
          .object({ email: z.string().email(), password: z.string().min(6) })
          .safeParse(credentials);

        if (parsedCredentials.success) {
          const { email, password } = parsedCredentials.data;
          const user = await getUser(email);
          if (!user) return null;

          console.log(password);
          console.log(user.password);
          const passwordsMatch = await bcrypt.compare(password, user.password);
          if (passwordsMatch) return user;
        }

        console.log('Invalid credentials');
        return null;
      },
    }),
  ],
});
