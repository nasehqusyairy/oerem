import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
    BelongsToManyColumn,
    createPool,
    InferModel,
    Model,
    SoftDeleteColumn,
    TimeStampColumns,
    // ModelInstance,
} from '../src/index';
import { belongsTo, belongsToMany, hasMany } from '../src/helper';
import { Knex } from 'knex';

describe('Oerem ORM Unit Test', () => {
    // 1. Setup koneksi database (In-Memory)
    const db = createPool({
        client: 'sqlite3',
        connection: { filename: ':memory:' },
        useNullAsDefault: true
    } as Knex.Config);

    // 2. Definisikan interface untuk testing
    type IRole = {
        id: number;
        name: string;
    } & IRoleRelations

    type IRoleRelations = {
        users?: BelongsToManyColumn<IUser, {
            user_id: number;
            role_id: number;
        }>
    }

    type IUser = {
        id: number;
        username: string;
        email: string;

        balance: number;

    } & IUserRelations & TimeStampColumns & SoftDeleteColumn

    type IUserRelations = {
        posts?: IPost[]
        roles?: BelongsToManyColumn<IRole, {
            user_id: number;
            role_id: number;
        }>
    }

    type IPost = {
        id: number;
        user_id: number;
        title: string;
        status: string;
    } & IPostRelations

    type IPostRelations = {
        comments?: IComment[];
    }

    type IComment = {
        id: number;
        post_id: number;
        user_id: number;
        content: string;
    } & ICommentRelations

    type ICommentRelations = {
        user?: IUser
    }

    // 3. Inisialisasi Model
    const Role = db.model<IRole, IRoleRelations>('roles', {
        fillable: ['name'],
        relations: {
            users: belongsToMany(() => User, 'role_user', 'role_id', 'user_id')
        }
    });

    const User: Model<IUser, IUserRelations> = db.model('users', {
        fillable: ['username', 'email', 'balance'],
        softDelete: true,
        relations: {
            posts: hasMany(() => Post, 'user_id'),
            roles: belongsToMany(() => Role, 'role_user', 'user_id', 'role_id')
        }
    });

    type MUser = InferModel<typeof User>

    const Post = db.model<IPost, IPostRelations>('posts', {
        fillable: ['user_id', 'title', 'status'],
        relations: {
            comments: hasMany(() => Comment, 'post_id')
        }
    });

    const Comment = db.model<IComment, ICommentRelations>('comments', {
        fillable: ['post_id', 'user_id', 'content'],
        relations: {
            user: belongsTo(() => User, 'user_id')
        }
    });

    beforeAll(async () => {
        // Buat tabel users sebelum test dijalankan
        await db.getConnection().schema.createTable('users', (table) => {
            table.increments('id').primary();
            table.string('username');
            table.string('email');
            // table.string('role').defaultTo('user');
            table.integer('balance').defaultTo(0);
            table.timestamps(true, true);
            table.datetime('deleted_at').nullable();
        });

        await db.getConnection().schema.createTable('roles', (table) => {
            table.increments('id');
            table.string('name');
            table.timestamps(true, true)
        });

        await db.getConnection().schema.createTable('role_user', (table) => {
            table.integer('user_id');
            table.integer('role_id');
        });

        await db.getConnection().schema.createTable('posts', (table) => {
            table.increments('id');
            table.integer('user_id').unsigned();
            table.string('title');
            table.string('status');
            table.timestamps(true, true);
        });

        await db.getConnection().schema.createTable('comments', (table) => {
            table.increments('id');
            table.integer('post_id').unsigned();
            table.integer('user_id').unsigned();
            table.text('content');
            table.timestamps(true, true);
        });

        await db.getConnection().schema.createTable('profiles', (table) => {
            table.increments('id');
            table.integer('user_id');
            table.string('bio');
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
                // role: 'admin' // Ini harusnya terfilter karena tidak ada di fillable
            });

            expect(newUser.id).toBe(1);
            expect(newUser.username).toBe('ghozali');
            // expect(newUser.role).toBeUndefined(); // Terfilter oleh applyFillable
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

        it('should update multiple records using query chaining', async () => {
            // Seed data tambahan
            await User.query(q => q.where('username', 'ghozali_updated')).update({ balance: 500 });

            const updatedUsers = await User.query(q => q.where('balance', 500)).get();
            expect(updatedUsers).toHaveLength(1);
            expect(updatedUsers[0].username).toBe('ghozali_updated');
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
            const deletedUser = await db.getConnection().table('users').where('id', 2).first();

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
            const dbCheck = await db.getConnection().table('users').where('username', 'spam_user').first();
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
            const dbCheck = await db.getConnection().table('users').where('username', 'temp_user').first();
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
            const checkDb = await db.getConnection().table('users').where('username', 'hacker').first();
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

            db.getConnection().on('query', queryTracker);

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
            db.getConnection().removeListener('query', queryTracker);
        });

        it('should block illegal query before it even reaches the database', async () => {
            let sqlSentToDb = false;
            const tracker = () => { sqlSentToDb = true; };
            db.getConnection().on('query', tracker);

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

            db.getConnection().removeListener('query', tracker);
        });

        it('should hide attributes defined in hidden options', async () => {
            const SecretUser = db.model<IUser>('users', {
                fillable: ['username', 'email'],
                hidden: ['email']
            });

            await SecretUser.create({ username: 'topsecret', email: 'secret@test.com' } as any);

            const user = await SecretUser.query(q => q.where('username', 'topsecret')).first();

            expect(user?.username).toBe('topsecret');
            expect((user as any).email).toBeUndefined(); // Tersembunyi
            expect((user as any).role).toBeUndefined();  // Tersembunyi
        });

        it('should block creation and update if a guarded field is present', async () => {
            const GuardedUser = db.model<IUser>('users', {
                guarded: ['balance'],
                fillable: ['username', 'balance'] // Role ada di fillable tapi di-block oleh guarded
            });

            // 1. Test Create: Harus melempar error karena ada 'role'
            await expect(
                GuardedUser.create({ username: 'normal', balance: 1000 })
            ).rejects.toThrow(/Cannot write to guarded field/);

            // 2. Buat data yang valid dulu untuk mencoba Update
            const user = await GuardedUser.create({ username: 'valid_user' });
            expect(user.username).toBe('valid_user');

            // 3. Test Update: Harus melempar error jika mencoba mengubah 'role'
            await expect(
                GuardedUser.update(user.id, { balance: 2000 })
            ).rejects.toThrow(/Cannot write to guarded field/);
        });

        it('should throw error when field is not in fillable list', async () => {
            const RestrictedUser = db.model<IUser>('users', { fillable: ['username'] });

            await expect(RestrictedUser.create({ username: 'ali', email: 'ali@test.com' } as any))
                .rejects
                .toThrow(/not in fillable list/);
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
                q.select('username as nama_lengkap', 'email as surel')
                    .where('username', 'ghozali')
            ).get<{
                nama_lengkap: string
                surel: string
            }>();

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
            }>();

            const row = results[0];

            expect(row.display_name).toBe('ghozali');
            expect(row.contact).toBe('ghozali@test.com');
        });

        // it('should support table aliasing and joins', async () => {
        //     await db.connection('profiles').insert({ user_id: 1, bio: 'Fullstack Dev' });

        //     // Testing Table Alias 'u' dan 'p'
        //     const results = await User.query(q => {
        //         return q.from('users as u')
        //             .join('profiles as p', 'u.id', 'p.user_id')
        //             .select(['u.username', 'p.bio'])
        //             .where('u.id', 1);
        //     }).get();

        //     expect(results[0]).toMatchObject({
        //         username: 'ghozali',
        //         bio: 'Fullstack Dev'
        //     });

        //     await db.getConnection().schema.dropTable('profiles');
        // });

        it('should support knex.raw for complex expressions', async () => {
            // Menggunakan raw untuk menghitung jumlah karakter username
            const results = await User.query(q => {
                return q.select(
                    'username',
                    db.getConnection().raw('LENGTH(username) as name_length')
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
                    .orderBy('id', 'desc');
            }).get();

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].username.toLowerCase()).toBe('ghozali');
        });

        // apply chaining where
        it('should allow chaining multiple where conditions', async () => {

            await User.create({ username: 'ghozali', email: 'ghozali2@test.com' });

            const results = await User.query(q => {
                return q.where('email', 'ghozali2@test.com').where('username', 'ghozali')
            }).get();

            expect(results.length).toBe(1);
            expect(results[0].username).toBe('ghozali');
            expect(results[0].email).toBe('ghozali2@test.com');
        });

        // it('should still apply Soft Delete even when using table aliases', async () => {
        //     // Skenario krusial: Jika user pakai alias 'u', 
        //     // pastikan auditor/soft-deleter kita tidak bingung.

        //     // Buat user yang terhapus (soft delete)
        //     const deletedUser = await User.create({ username: 'terhapus', email: 'del@test.com' });
        //     await User.softDelete(deletedUser.id);

        //     const results = await User.query(q => {
        //         // User menggunakan alias tabel
        //         return q.from('users as u').select('u.username');
        //     }).get();

        //     // Harusnya 'terhapus' tidak muncul karena global scope whereNull
        //     const hasDeleted = results.some(u => u.username === 'terhapus');
        //     expect(hasDeleted).toBe(false);
        // });

        it('should support distinct values', async () => {
            // Setup data duplikat untuk testing
            await User.create({ username: 'duplicate', email: 'a@test.com' });
            await User.create({ username: 'duplicate', email: 'b@test.com' });

            const results = await User.query(q =>
                q.distinct('username').where('username', 'duplicate')
            ).get();

            expect(results.length).toBe(1);
            expect(results[0].username).toBe('duplicate');
        });

        it('should handle orderBy, limit, and offset for pagination', async () => {
            // Pastikan ada cukup data
            await User.create({ username: 'user_a', email: 'a@test.com' });
            await User.create({ username: 'user_b', email: 'b@test.com' });
            await User.create({ username: 'user_c', email: 'c@test.com' });

            const results = await User.query(q =>
                q.whereLike('username', 'user_%').orderBy('username', 'asc').limit(2).offset(1)
            ).get();

            // Jika urutannya a, b, c -> limit 2 offset 1 harusnya mengambil b dan c
            expect(results.length).toBe(2);
            expect(results[0].username).toBe('user_b');
            expect(results[1].username).toBe('user_c');
        });

        it('should support grouping and having constraints', async () => {
            // Setup data untuk agregasi
            await User.create({ username: 'group_a', email: '1@test.com' });
            await User.create({ username: 'group_a', email: '2@test.com' });
            await User.create({ username: 'group_b', email: '3@test.com' });

            const results = await User.query(q =>
                q.select('username')
                    .count('id as total')
                    .groupBy('username')
                    .having('total', '>', 1)
                    .whereLike('username', 'group_%')
            ).get<{ username: string, total: number }>();

            expect(results.length).toBe(1);
            expect(results[0].username).toBe('group_a');
            expect(Number(results[0].total)).toBe(2);
        });

        it('should handle aggregate functions (max, min, avg)', async () => {
            // Kita bisa menggunakan query callback untuk mendapatkan hasil agregat murni
            const results = await User.query(q =>
                q.max('id as max_id')
                    .min('id as min_id')
                    .avg('id as avg_id')
            ).get<{ max_id: number, min_id: number, avg_id: number }>();

            const stats = results[0];

            expect(stats.max_id).toBeGreaterThan(0);
            expect(stats.min_id).toBeGreaterThan(0);
            expect(Number(stats.avg_id)).toBeTypeOf('number');
        });

        it('should support subquery-like behavior with having callback', async () => {
            const results = await User.query(q =>
                q.select('username')
                    .groupBy('username')
                    .having(db.getConnection().raw('COUNT(id)'), '>', 0)
            ).get();

            expect(results.length).toBeGreaterThan(0);
        });

        // count using alias
        it('should support count aggregate function with alias', async () => {
            const results = await User.query(q =>
                q.count({ total_users: 'id' })
            ).get<{ total_users: number }>();
            const total = results[0].total_users;
            expect(Number(total)).toBeGreaterThan(0);
        });

        // sum
        it('should support sum aggregate function', async () => {
            const results = await User.query(q =>
                q.sum('id as total_id')
            ).get<{ total_id: number }>();
            const total = results[0].total_id;

            expect(Number(total)).toBeGreaterThan(0);
        });
    });

    describe('Oerem Advanced Scopes & Batch', () => {

        it('should perform batch insert with fillable and timestamps', async () => {
            await User.insert([
                { username: 'user1_a', email: 'a@test.com' },
                { username: 'user2_b', email: 'b@test.com' }
            ]);

            const count = await User.query(q => q.whereIn('username', ['user1_a', 'user2_b'])).get();

            // console.log(count);


            expect(count).toHaveLength(2);
            expect(count[0].created_at).toBeDefined();
        });

        it('should include deleted records when using withTrashed()', async () => {
            // 1. Buat user dan hapus
            const user = await User.create({ username: 'ghost', email: 'ghost@test.com' });
            await User.softDelete(user.id);

            // 2. Cek get() biasa (tidak boleh ada)
            const regular = await User.query(q => q.where('username', 'ghost')).get();
            expect(regular).toHaveLength(0);

            // 3. Cek withTrashed() (harus ada)
            const withDeleted = await User.withTrashed().query(q => q.where('username', 'ghost')).get();
            expect(withDeleted).toHaveLength(1);
        });

        it('should only return deleted records when using onlyTrashed()', async () => {
            // user 'ghost' masih ada di DB dalam keadaan terhapus dari test sebelumnya
            const onlyDeleted = await User.onlyTrashed().get();

            // Pastikan semua yang keluar punya deleted_at
            expect(onlyDeleted.length).toBeGreaterThan(0);
            expect(onlyDeleted.every(u => u.deleted_at !== null)).toBe(true);
        });
    });

    describe('Oerem Eager Loading (Relations)', () => {

        beforeAll(async () => {

            // Seeding Data
            const user = await User.create({ username: 'nasyikh' });
            const user2 = await User.create({ username: 'nobel' });

            await Post.insert([
                { user_id: user.id, title: 'Post Pertama', status: 'published' },
                { user_id: user.id, title: 'Post Kedua', status: 'draft' },
                { user_id: 99, title: 'Post Orang Lain', status: 'published' }
            ]);

            await Comment.insert([
                { post_id: 1, user_id: user.id, content: 'Komentar untuk Post Pertama' },
                { post_id: 1, user_id: user2.id, content: 'Komentar kedua untuk Post Pertama' },
                { post_id: 2, user_id: user.id, content: 'Komentar untuk Post Kedua' }
            ]);
        });

        it('should load hasMany relationship simply', async () => {
            const user = await User.query(q => q.where('username', 'nasyikh'))
                .with('posts.comments.user')
                .first();

            expect(user).toBeDefined();
            expect(user?.posts).toHaveLength(2);
            expect(user?.posts?.[0].title).toBe('Post Pertama');

            // Cek eager loading nested comments
            const comments = user?.posts?.[0].comments;
            expect(comments).toBeDefined();
            expect(comments?.[0].content).toBe('Komentar untuk Post Pertama');

            // Cek eager loading nested comments.user
            expect(user?.posts?.[0].comments?.[1].user?.username).toBe('nobel')
        });

        it('should load relationship with nested query constraints', async () => {
            type MPost = InferModel<typeof Post>;
            type MComment = InferModel<typeof Comment>;

            const user = await User.query(q => q.where('username', 'nasyikh'))
                .with({
                    posts: (p: MPost['builder']) => p.query(q => q.where('status', 'published')).with({
                        comments: (c: MComment['builder']) => c.query(q => q.whereLike('content', '%kedua%')).with('user')
                    })
                })
                .first();

            expect(user?.posts).toHaveLength(1);
            expect(user?.posts?.[0].status).toBe('published');
            expect(user?.posts?.[0].title).toBe('Post Pertama');

            // Cek eager loading nested comments
            const comments = user?.posts?.[0].comments;
            expect(comments).toHaveLength(1);
            expect(comments?.[0].content).toBe('Komentar kedua untuk Post Pertama');

            expect(user?.posts?.[0].comments?.[0].user?.username).toBe('nobel')
        });

        it('should handle multiple records with eager loading (Anti N+1)', async () => {
            // Buat user kedua
            const user2 = await User.create({ username: 'alqusyairy' });
            await Post.create({ user_id: user2.id, title: 'Post User 2', status: 'published' });

            const users = await User.with('posts.comments').get();

            const u1 = users.find(u => u.username === 'nasyikh');
            const u2 = users.find(u => u.username === 'alqusyairy');

            expect(u1?.posts).toHaveLength(2);
            expect(u2?.posts).toHaveLength(1);
        });

        it('should return null or empty array if no relation found', async () => {
            const loneUser = await User.create({ username: 'lonely' });

            const user = await User.query(q => q.where('id', loneUser.id))
                .with('posts')
                .first();

            expect(user?.posts).toEqual([]);
        });

        it('should handle many-to-many manipulation via .related() method', async () => {
            // 1. Seed data awal (Model Role dan User)
            const adminRole = await Role.create({ name: 'admin' });
            const editorRole = await Role.create({ name: 'editor' });
            const viewerRole = await Role.create({ name: 'viewer' });
            const user = await User.create({ username: 'm2m_related_test' });

            // 2. Testing ATTACH via .related()
            // Kita panggil .related() dari instance 'user' yang baru dibuat
            await user.related({
                roles: async (r) => {
                    await r.attach([adminRole.id, editorRole.id]);
                }
            });

            // 3. Verifikasi Eager Loading & Pivot
            const result = await User.query(q => q.where('id', user.id))
                .with('roles')
                .first();

            expect(result).toBeDefined();
            expect(result?.roles).toHaveLength(2);

            // Cek keberadaan objek pivot
            const firstRole = result?.roles?.[0] as any;
            expect(firstRole.pivot).toBeDefined();
            expect(firstRole.pivot.user_id).toBe(user.id);

            // 4. Testing DETACH & CREATE via .related() dalam satu blok
            // Skenario: Hapus satu role, dan buat role baru sekaligus attach
            await (result as any).related({
                roles: async (r: any) => {
                    await r.detach(adminRole.id); // Hapus admin
                    await r.create({ name: 'super_admin' }); // Buat baru & otomatis attach
                }
            });

            // 5. Verifikasi Akhir
            const finalResult = await User.query(q => q.where('id', user.id))
                .with('roles')
                .first();

            const roleNames = finalResult?.roles?.map((r: any) => r.name);
            expect(roleNames).not.toContain('admin');
            expect(roleNames).toContain('editor');
            expect(roleNames).toContain('super_admin');
            expect(finalResult?.roles).toHaveLength(2);

            // 6. Pastikan .related() TIDAK muncul saat JSON stringify
            const jsonString = JSON.stringify(finalResult);
            const parsed = JSON.parse(jsonString);
            expect(parsed.related).toBeUndefined(); // Harus bersih!
        });
    });

    // transaction test
    describe('Oerem Transactions', () => {

        it('should commit changes when transaction is successful', async () => {
            await db.transaction(async () => {
                await db.getConnection().table('users').insert({
                    username: 'alice',
                    balance: 100
                });
            });

            const user = await db.getConnection().table('users').where('username', 'alice').first();
            expect(user).toBeDefined();
            expect(user.balance).toBe(100);
        });

        it('should work with Oerem Model factory (Injected Connection)', async () => {

            await db.transaction(async () => {
                await User.create({ username: 'charlie', balance: 200 });
            });

            const charlie = await db.getConnection().table('users').where('username', 'charlie').first();
            expect(charlie.balance).toBe(200);
        });

        it('should rollback all changes if any operation within the transaction fails', async () => {
            try {
                await db.transaction(async () => {
                    await User.create({ username: 'dave', balance: 300 });
                    await db.getConnection().table('users').insert({
                        username: 'bob',
                        balance: 500
                    });
                    // Paksa error setelah beberapa operasi sukses
                    throw new Error('Forced Error to Test Rollback');
                });
            } catch (e) {
                // Error ditangkap di sini
            }

            const dave = await db.getConnection().table('users').where('username', 'dave').first();
            const bob = await db.getConnection().table('users').where('username', 'bob').first();
            expect(dave).toBeUndefined(); // Harusnya tidak ada karena rollback
            expect(bob).toBeUndefined(); // Harusnya tidak ada karena rollback
        });
    })

})