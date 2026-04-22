# Oerem 🍬

**Oerem** (Object-literal Easy Relation Manager) is a lightweight, functional, and powerful TypeScript ORM built on top of [Knex.js](https://knexjs.org/). It is specifically designed for rapid development using an *object-literal* pattern without sacrificing relational integrity or transaction safety.

## ✨ Key Features

  * **Atomic Transactions**: Automatic transaction management via `AsyncLocalStorage`. Forget about passing the `trx` variable manually through every function.
  * **Relationship Persistence**: Elegant relationship manipulation using `.related()`. Supports `attach`, `detach`, `create`,`update`,`updatePivot`,`delete`, and `softDelete` directly through relations.
  * **Smart Eager Loading**: Built-in handling for `hasOne`, `hasMany`, `belongsTo`, and `belongsToMany` (Many-to-Many) with high-performance execution.
  * **JSON-Safe**: All internal methods are *non-enumerable*, ensuring your object output remains clean when parsed to JSON for API responses.
  * **Soft Deletes**: Native support for logical deletion across all queries.

## 📦 Installation

```bash
npm install oerem knex

# Don't forget to install your database driver (pg, mysql2, sqlite3, etc.)
npm install pg
npm install pg-native
npm install sqlite3
npm install better-sqlite3
npm install mysql
npm install mysql2
npm install oracledb
npm install tedious
```

## 🚀 Getting Started

### 1\. Initialization

```typescript
import { createOerem } from 'oerem';
import { createOerem } from 'oerem';

export const db = createOerem({
  client: process.env.DB_CONNECTION || 'mysql2',
  connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'lalase',
  }
} as Knex.Config);
```

### 2\. Defining a Model

```typescript
import {
    BelongsToManyColumn,
    Model,
    SoftDeleteColumn,
    TimeStampColumns,
    belongsToMany,
    hasMany
} from 'oerem';

export type TUser = {
  id: number;
  name: string;
  email: string;
  password: string;

} & TRUser & TimeStampColumns & SoftDeleteColumn

export type TRUser = {
    posts?: IPost[]
    roles?: BelongsToManyColumn<IRole, {
        user_id: number;
        role_id: number;
    }>
}

export const User: Model<TUser, TRUser> = db.model('users', {
  fillable: ['name', 'email','password'],
  hidden:['password'],
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
const users = await User.query(q=>q.whereNot('id', 1))
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

-----

Built with ❤️ for the **Lalase Framework** ecosystem.