import { prisma } from "@repo/database";

async function main() {
  const users = await prisma.user.findMany();
  console.log(users);
}

main();
