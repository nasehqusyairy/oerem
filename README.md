Certainly\! Here is the professional version of your `README.md` translated into English, optimized for the open-source community.

-----

# Oerem 🍬

**Oerem** (Object-literal Easy Relation Manager) is a lightweight, functional, and powerful TypeScript ORM built on top of [Knex.js](https://knexjs.org/). It is specifically designed for rapid development using an *object-literal* pattern without sacrificing relational integrity or transaction safety.

[](https://www.google.com/search?q=https://www.npmjs.com/package/oerem)
[](https://www.google.com/search?q=LICENSE)

## ✨ Key Features

  * **Atomic Transactions**: Automatic transaction management via `AsyncLocalStorage`. Forget about passing the `trx` variable manually through every function.
  * **Relationship Persistence**: Elegant relationship manipulation using `.related()`. Supports `attach`, `detach`, `sync`, and `create` directly through relations.
  * **Smart Eager Loading**: Built-in handling for `hasOne`, `hasMany`, `belongsTo`, and `belongsToMany` (Many-to-Many) with high-performance execution.
  * **JSON-Safe**: All internal methods are *non-enumerable*, ensuring your object output remains clean when parsed to JSON for API responses.
  * **Soft Deletes**: Native support for logical deletion across all queries.

## 📦 Installation

```bash
npm install oerem knex
# Don't forget to install your database driver (pg, mysql2, sqlite3, etc.)
```

## 🚀 Getting Started

### 1\. Initialization

```typescript
import { createOerem } from 'oerem';

export const db = createOerem({
  client: 'mysql2',
  connection: { /* knex configuration */ }
});
```

### 2\. Defining a Model

```typescript
export const User = db.model<UserAttributes, UserRelations>('users', {
  fillable: ['username', 'email'],
  softDelete: true,
  relations: {
    posts: hasMany(() => Post, 'user_id'),
    roles: belongsToMany(() => Role, 'role_user', 'user_id', 'role_id')
  }
});
```

### 3\. Usage

**Eager Loading with Pivot Data:**

```typescript
const users = await User.query()
  .with('roles', 'posts')
  .get();

// Roles output automatically includes the .pivot property
console.log(users[0].roles[0].pivot.assigned_at);
```

**Automated Transactions:**

```typescript
await db.transaction(async () => {
  const user = await User.create({ username: 'nasyikh' });
  
  // The .related() method detects the transaction context automatically
  await user.related({
    roles: (r) => r.attach(1)
  });
});
```

**Relationship Manipulation (.related):**

```typescript
const user = await User.find(1);

await user.related({
  roles: (r) => r.sync([1, 2, 3]), // Detach missing IDs, attach new ones
  posts: (p) => p.create({ title: 'Hello Oerem!' })
});
```

## 🛠 Relationship API (.related)

| Method | Description | Applicable To |
| :--- | :--- | :--- |
| `create(data)` | Creates a child record & automatically links the Foreign Key. | All |
| `attach(ids, pivotData?)` | Links existing IDs to the pivot table. | belongsToMany |
| `detach(ids?)` | Removes links in the pivot table. | belongsToMany |
| `updatePivot(id, data)` | Updates data in the intermediate (pivot) table. | belongsToMany |
| `update(id, data)` | Updates related records within the parent scope. | All |
| `delete(id?)` | Deletes related records within the parent scope. | All |

## 🧪 Development & Testing

To contribute or perform local testing:

```bash
# Clone the repository
git clone https://github.com/username/oerem.git

# Install dependencies
npm install

# Build the library
npm run build

# Run tests
npm test
```

-----

Built with ❤️ for the **Lalacan Framework** ecosystem.