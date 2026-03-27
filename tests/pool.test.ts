import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createOerem } from '../src/index';

describe('Oerem ORM Unit Test', () => {
    // 1. Setup koneksi database (In-Memory)
    const db = createOerem({
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true
    });

    // 2. Definisikan interface untuk testing
    interface IUser {
        id: number;
        username: string;
        email: string;
        role: string;
        created_at?: string;
        updated_at?: string;
        deleted_at?: string | null;
    }

    // 3. Inisialisasi Model
    const User = db.model<IUser>('users', {
        fillable: ['username', 'email'], // 'role' sengaja tidak dimasukkan
        softDelete: true,
        timestamps: true
    });

    beforeAll(async () => {
        // Buat tabel users sebelum test dijalankan
        await db.connection.schema.createTable('users', (table) => {
            table.increments('id').primary();
            table.string('username');
            table.string('email');
            table.string('role').defaultTo('user');
            table.timestamps(true, true);
            table.datetime('deleted_at').nullable();
        });
    });

    afterAll(async () => {
        await db.close();
    });

    describe('Oerem Basic Functions', () => {
        it('should create a record with fillable and timestamps', async () => {
            const newUser = await User.create({
                username: 'ghozali',
                email: 'ghozali@example.com',
                role: 'admin' // Ini harusnya terfilter karena tidak ada di fillable
            } as any);

            expect(newUser.id).toBe(1);
            expect(newUser.username).toBe('ghozali');
            expect(newUser.role).toBeUndefined(); // Terfilter oleh applyFillable
            expect(newUser.created_at).toBeDefined();
        });

        it('should find a record by id', async () => {
            const user = await User.find(1);
            expect(user).toBeDefined();
            expect(user?.username).toBe('ghozali');
        });

        it('should update a record and refresh updated_at', async () => {
            const oldUser = await User.find(1);

            // Tunggu sebentar agar timestamp berbeda
            await new Promise(res => setTimeout(res, 1000));

            await User.update(1, { username: 'ghozali_updated' });
            const updatedUser = await User.find(1);

            expect(updatedUser?.username).toBe('ghozali_updated');
            expect(updatedUser?.updated_at).not.toBe(oldUser?.updated_at);
        });

        it('should handle complex chaining with query() and get()', async () => {
            // Tambah user baru untuk testing chaining
            await User.create({ username: 'kafa', email: 'kafa@example.com' });

            const results = await User.with().query(q => q.where('username', 'like', '%kafa%').orderBy('id', 'desc')).get()

            expect(results).toHaveLength(1);
            expect(results[0].username).toBe('kafa');
        });

        it('should perform soft delete and exclude it from all()', async () => {
            // Soft delete user id 2 (kafa)
            await User.softDelete(2);

            const allUsers = await User.all();
            const deletedUser = await db.connection('users').where('id', 2).first();

            // Di hasil ORM harusnya cuma sisa 1 (si ghozali)
            expect(allUsers).toHaveLength(1);
            expect(allUsers[0].username).toBe('ghozali_updated');

            // Tapi di database aslinya record-nya masih ada
            expect(deletedUser).toBeDefined();
            expect(deletedUser.deleted_at).not.toBeNull();
        });

        it('should fail soft delete if option is not enabled', async () => {
            const StrictModel = db.model('other_table', { softDelete: false });

            await expect(StrictModel.softDelete(1)).rejects.toThrow("Soft delete disabled");
        });
    })

    describe('Direct vs Chained Actions', () => {

        it('should perform mass update via chaining without needing an ID', async () => {
            // Seed data tambahan
            await User.create({ username: 'kafa_1', email: 'kafa1@test.com' });
            await User.create({ username: 'kafa_2', email: 'kafa2@test.com' });

            // Chained Update: Update semua user yang username-nya mengandung 'kafa'
            // Perhatikan: di sini kita tidak memasukkan ID pada .update()
            const affectedRows = await User
                .query(q => q.where('username', 'like', 'kafa_%'))
                .update({ email: 'updated_massal@test.com' });

            expect(affectedRows).toBe(2);

            const updatedUsers = await User.query(q => q.where('email', 'updated_massal@test.com')).get();

            expect(updatedUsers).toHaveLength(2);
        });

        it('should perform hard delete via chaining', async () => {
            // Seed data untuk dihapus
            await User.create({ username: 'spam_user', email: 'spam@test.com' });

            // Chained Delete: Hapus berdasarkan kriteria
            await User.query(q => q.where('username', 'spam_user')).delete();

            const check = await User.query(q => q.where('username', 'spam_user')).get();
            expect(check).toHaveLength(0);

            // Verifikasi di DB aslinya memang benar-benar hilang (bukan soft delete)
            const dbCheck = await db.connection('users').where('username', 'spam_user').first();
            expect(dbCheck).toBeUndefined();
        });

        it('should perform soft delete via chaining and respect the filter', async () => {
            await User.create({ username: 'temp_user', email: 'temp@test.com' });

            // Chained Soft Delete
            await User.query(q => q.where('username', 'temp_user')).softDelete();

            const results = await User.all();
            const isExistInResults = results.some(u => u.username === 'temp_user');
            expect(isExistInResults).toBe(false);

            // Verifikasi di database masih ada tapi punya timestamp deleted_at
            const dbCheck = await db.connection('users').where('username', 'temp_user').first();
            expect(dbCheck.deleted_at).not.toBeNull();
        });

        it('should prioritize direct ID over previous query filters in Model Shortcut', async () => {
            // Skenario: User memanggil shortcut .update(id, data) langsung dari model.
            // Sesuai desain kita, model shortcut harusnya mengabaikan chaining builder sebelumnya 
            // atau menciptakan instance builder baru yang bersih.

            const user = await User.create({ username: 'direct_test', email: 'direct@test.com' });

            // Langsung panggil dari Model Shortcut
            await User.update(user.id, { username: 'direct_ok' });

            const updated = await User.find(user.id);
            expect(updated?.username).toBe('direct_ok');
        });

        it('should correctly handle hard delete from Model Shortcut', async () => {
            const user = await User.create({ username: 'to_be_killed', email: 'kill@test.com' });

            // Shortcut Delete by ID
            await User.delete(user.id);

            const check = await User.find(user.id);
            expect(check).toBeUndefined();
        });
    });

    describe('Security & Auditor Constraints', () => {

        it('should throw an error if user tries to call .first() inside a .get() chain', async () => {
            // Skenario: User mencoba 'menyelundupkan' first di dalam callback query()
            // lalu mengeksekusinya menggunakan .get()
            const illegalQuery = User.query(q => {
                return (q as any).first();
            });

            // Harus error karena auditor mendeteksi 'first' dalam grouping statements
            await expect(illegalQuery.get())
                .rejects
                .toThrow("Oerem: 'first' is not allowed in 'get' query. Use 'find' or 'first' method instead.");
        });

        it('should throw an error if user tries to call .insert() inside a .get() chain', async () => {
            // Skenario: User mencoba 'menyelundupkan' insert di dalam callback query()
            // lalu mengeksekusinya menggunakan .get()
            const illegalQuery = User.query(q => {
                return (q as any).insert({ username: 'hacker', email: 'hacker@test.com' });
            });

            // Harus error karena auditor mendeteksi 'insert' dalam grouping statements
            await expect(illegalQuery.get())
                .rejects
                .toThrow("Oerem: Illegal write operation detected in a read query!");

            // Verifikasi data benar-benar tidak masuk ke database
            const checkDb = await db.connection('users').where('username', 'hacker').first();
            expect(checkDb).toBeUndefined();
        });

        it('should throw an error if user tries to call .delete() inside a .get() chain', async () => {
            // Seed data untuk percobaan penghapusan ilegal
            await User.create({ username: 'victim', email: 'victim@test.com' });

            const illegalDelete = User.query(q => {
                return (q as any).del().where('username', 'victim');
            });

            await expect(illegalDelete.get())
                .rejects
                .toThrow("Oerem: Illegal write operation detected in a read query!");

            // Verifikasi user 'victim' masih ada (tidak terhapus)
            const victim = await User.query(q => q.where('username', 'victim')).get();
            expect(victim).toHaveLength(1);
        });

        it('should throw an error if user tries to call .update() inside a .get() chain', async () => {
            const illegalUpdate = User.query(q => {
                return (q as any).update({ username: 'pwned' }).where('id', 1);
            });

            await expect(illegalUpdate.get())
                .rejects
                .toThrow("Oerem: Illegal write operation detected in a read query!");

            // Verifikasi id 1 tetap ghozali_updated, bukan pwned
            const user1 = await User.find(1);
            expect(user1?.username).not.toBe('pwned');
        });

        it('should allow normal select operations without interference', async () => {
            // Memastikan auditor tidak "over-protective" dan tetap mengizinkan query normal
            const normalQuery = await User.query(q => q.where('id', '>', 0)).get();

            expect(Array.isArray(normalQuery)).toBe(true);
            expect(normalQuery.length).toBeGreaterThan(0);
        });

        it('should not execute any SQL until .get() is called, and execute it exactly when called', async () => {
            // 1. Setup tracker untuk memantau aktivitas query
            let queryExecuted = false;
            let capturedSql = '';

            const queryTracker = (obj: any) => {
                queryExecuted = true;
                capturedSql = obj.sql;
            };

            db.connection.on('query', queryTracker);

            // 2. Tahap Persiapan: Buat rangkaian query (chaining)
            // Di sini kita hanya membangun objek, belum mengeksekusi.
            const pendingQuery = User.query(q => q.where('username', 'ghozali'));

            // 3. Verifikasi Awal: Event 'query' TIDAK BOLEH terpicu
            expect(queryExecuted, 'Database tidak boleh menerima query sebelum .get() dipanggil').toBe(false);

            // 4. Tahap Eksekusi: Panggil .get()
            await pendingQuery.get();

            // 5. Verifikasi Akhir: Event 'query' HARUS terpicu
            expect(queryExecuted, 'Database harus menerima query saat .get() dipanggil').toBe(true);
            expect(capturedSql).toContain('select');
            expect(capturedSql).toContain('`username` = ?');

            // Cleanup listener agar tidak bocor ke test case lain
            db.connection.removeListener('query', queryTracker);
        });

        it('should block illegal query before it even reaches the database', async () => {
            let sqlSentToDb = false;
            const tracker = () => { sqlSentToDb = true; };
            db.connection.on('query', tracker);

            // Skenario: User mencoba menyisipkan update di dalam read query
            const illegalUpdate = User.query(q => (q as any).update({ username: 'hacker' }));

            // Saat kita panggil .get(), auditor harus melempar error
            // DAN sqlSentToDb harus tetap false karena error dilempar SEBELUM 'await currentQuery'
            try {
                await illegalUpdate.get();
            } catch (e) {
                // Error tertangkap sesuai ekspektasi
            }

            expect(sqlSentToDb, 'Query ilegal tidak boleh sampai menyentuh database').toBe(false);

            db.connection.removeListener('query', tracker);
        });
    });

    describe('Knex Native Features Compatibility', () => {

        it('should support field aliasing using "as" string', async () => {
            const added = await User.find(1)
            if (added && added.username !== 'ghozali') {
                await User.update(1, { username: 'ghozali', email: 'ghozali@test.com' });
            } else {
                await User.create({ username: 'ghozali', email: 'ghozali@test.com' });
            }

            const results = await User.query(q =>
                q.select(['username as nama_lengkap', 'email as surel'])
                    .where('username', 'ghozali')
            ).get<{
                nama_lengkap: string
                surel: string
            }[]>();

            const row = results[0];
            expect(row.nama_lengkap).toBe('ghozali');
            expect(row.surel).toBe('ghozali@test.com');
            expect((row as any).username).toBeUndefined(); // Field asli harusnya tidak ada
        });

        it('should support field aliasing using object mapping', async () => {
            const results = await User.query(q =>
                q.select({
                    display_name: 'username',
                    contact: 'email'
                }).where('id', 1)
            ).get<{
                display_name: string
                contact: string
            }[]>();

            const row = results[0];
            console.log(row.display_name);

            expect(row.display_name).toBe('ghozali');
            expect(row.contact).toBe('ghozali@test.com');
        });

        it('should support table aliasing and joins', async () => {
            // Setup table tambahan untuk join
            await db.connection.schema.createTable('profiles', (table) => {
                table.increments('id');
                table.integer('user_id');
                table.string('bio');
            });

            await db.connection('profiles').insert({ user_id: 1, bio: 'Fullstack Dev' });

            // Testing Table Alias 'u' dan 'p'
            const results = await User.query(q => {
                return q.from('users as u')
                    .join('profiles as p', 'u.id', 'p.user_id')
                    .select(['u.username', 'p.bio'])
                    .where('u.id', 1);
            }).get();

            expect(results[0]).toMatchObject({
                username: 'ghozali',
                bio: 'Fullstack Dev'
            });

            await db.connection.schema.dropTable('profiles');
        });

        it('should support knex.raw for complex expressions', async () => {
            // Menggunakan raw untuk menghitung jumlah karakter username
            const results = await User.query(q => {
                return q.select(
                    'username',
                    db.connection.raw('LENGTH(username) as name_length')
                ).where('id', 1);
            }).get();

            const row = results[0] as any;
            expect(row.username).toBe('ghozali');
            // SQLite menggunakan LENGTH(), MySQL juga sama.
            expect(Number(row.name_length)).toBe(7);
        });

        it('should handle whereRaw and orderbyRaw', async () => {
            const results = await User.query(q => {
                return q.whereRaw('LOWER(username) = ?', ['ghozali'])
                    .orderByRaw('id DESC');
            }).get();

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].username.toLowerCase()).toBe('ghozali');
        });

        it('should still apply Soft Delete even when using table aliases', async () => {
            // Skenario krusial: Jika user pakai alias 'u', 
            // pastikan auditor/soft-deleter kita tidak bingung.

            // Buat user yang terhapus (soft delete)
            const deletedUser = await User.create({ username: 'terhapus', email: 'del@test.com' });
            await User.softDelete(deletedUser.id);

            const results = await User.query(q => {
                // User menggunakan alias tabel
                return q.from('users as u').select('u.username');
            }).get();

            // Harusnya 'terhapus' tidak muncul karena global scope whereNull
            const hasDeleted = results.some(u => u.username === 'terhapus');
            expect(hasDeleted).toBe(false);
        });
    });

})