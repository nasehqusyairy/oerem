Tentu, ini adalah draf `README.md` yang profesional, ringkas, dan menonjolkan fitur utama **Oerem**. Saya menyesuaikan nadanya agar cocok sebagai library pendamping framework **Lalacan**.

-----

# Oerem 🍬

**Oerem** (Object-literal Easy Relation Manager) adalah ORM TypeScript yang ringan, fungsional, dan bertenaga di atas [Knex.js](https://knexjs.org/). Didesain khusus untuk kecepatan pengembangan dengan pola *object-literal* tanpa mengorbankan integritas relasi dan transaksi.

[](https://www.google.com/search?q=https://www.npmjs.com/package/oerem)
[](https://www.google.com/search?q=LICENSE)

## ✨ Fitur Utama

  * **Atomic Transactions**: Pengelolaan transaksi otomatis menggunakan `AsyncLocalStorage`. Lupakan *passing* variabel `trx` ke mana-mana.
  * **Relationship Persistence**: Manipulasi relasi yang elegan dengan `.related()`. Mendukung `attach`, `detach`, `sync`, dan `create` melalui relasi.
  * **Smart Eager Loading**: Penanganan relasi `hasOne`, `hasMany`, `belongsTo`, dan `belongsToMany` (Many-to-Many) dengan performa kencang.
  * **JSON-Safe**: Semua method internal bersifat *non-enumerable*, sehingga output objek tetap bersih saat di-parsing ke JSON.
  * **Soft Deletes**: Dukungan bawaan untuk penghapusan logis di seluruh kueri.

## 📦 Instalasi

```bash
npm install oerem knex
# Jangan lupa install driver database Anda (pg, mysql2, sqlite3, dll)
```

## 🚀 Memulai

### 1\. Inisialisasi

```typescript
import { createOerem } from 'oerem';

export const db = createOerem({
  client: 'mysql2',
  connection: { /* konfigurasi knex */ }
});
```

### 2\. Definisi Model

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

### 3\. Penggunaan

**Eager Loading dengan Pivot:**

```typescript
const users = await User.query()
  .with('roles', 'posts')
  .get();

// Output roles otomatis memiliki properti .pivot
console.log(users[0].roles[0].pivot.assigned_at);
```

**Otomatisasi Transaksi:**

```typescript
await db.transaction(async () => {
  const user = await User.create({ username: 'nasyikh' });
  
  // Method .related() mendeteksi transaksi secara otomatis
  await user.related({
    roles: (r) => r.attach(1)
  });
});
```

**Manipulasi Relasi (.related):**

```typescript
const user = await User.find(1);

await user.related({
  roles: (r) => r.sync([1, 2, 3]), // Detach yang lama, attach yang baru
  posts: (p) => p.create({ title: 'Halo Lalacan!' })
});
```

## 🛠 API Relasi (.related)

| Method | Deskripsi | Berlaku Untuk |
| :--- | :--- | :--- |
| `create(data)` | Membuat data anak & otomatis menghubungkan FK. | Semua |
| `attach(ids, pivotData?)` | Menghubungkan ID ke tabel pivot. | belongsToMany |
| `detach(ids?)` | Memutuskan hubungan di tabel pivot. | belongsToMany |
| `sync(ids)` | Singkronisasi total data pivot. | belongsToMany |
| `updatePivot(id, data)` | Mengubah data di tabel perantara. | belongsToMany |
| `update(id, data)` | Mengubah data anak dengan scope parent. | Semua |
| `delete(id?)` | Menghapus data anak dengan scope parent. | Semua |

## 🧪 Development & Testing

Jika Anda ingin berkontribusi atau melakukan testing lokal:

```bash
# Clone repository
git clone https://github.com/username/oerem.git

# Install dependencies
npm install

# Build library
npm run build

# Run tests
npm test
```

## 📝 Lisensi

Distribusi di bawah lisensi MIT. Lihat `LICENSE` untuk informasi lebih lanjut.

-----

Dibuat dengan ❤️ untuk ekosistem **Lalacan Framework**.