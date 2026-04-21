import { Knex } from "knex";

// ============================================================
// SelectBuilder
//
// Interface untuk menyusun query SELECT ... FROM {table} ...
// Method yang dibuang:
//   - DML         : insert, update, delete, del, truncate, upsert, returning
//   - Table       : from, table, into, as  (sudah ditentukan oleh model)
//   - CTE         : with, withRecursive, withMaterialized, withNotMaterialized
//   - Set ops     : union, unionAll, intersect, except
//   - Lock hints  : forUpdate, forShare, forNoKeyUpdate, forKeyShare, skipLocked, noWait
//   - Low-level   : raw, ref
//   - Duplikat    : first (sudah ada di OeremBuilder)
// ============================================================

type QueryCallback<T extends Record<string, unknown>> = (query: SelectBuilder<T>) => void;

export interface SelectBuilder<T extends Record<string, unknown>> {

    // ----------------------------------------------------------
    // SELECT / COLUMNS
    // ----------------------------------------------------------
    // column(column: Knex.ColumnDescriptor<T, unknown>): this;
    // column(...columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;
    // columns(column: Knex.ColumnDescriptor<T, unknown>): this;
    // columns(...columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;

    // select(): this;
    select(column: Knex.ColumnDescriptor<T, unknown>): this;
    select(...columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;
    select(columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;

    distinct(): this;
    distinct(column: Knex.ColumnDescriptor<T, unknown>): this;
    distinct(...columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;
    distinct(columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;

    distinctOn(column: Knex.ColumnDescriptor<T, unknown>): this;
    distinctOn(...columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;
    distinctOn(columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;

    // ----------------------------------------------------------
    // WHERE
    // ----------------------------------------------------------
    where(raw: Knex.Raw): this;
    where(callback: QueryCallback<T>): this;
    where(object: Knex.DbRecord<T>): this;
    where(columnName: keyof T & string, value: Knex.DbColumn<T[keyof T]>): this;
    where(columnName: keyof T & string, operator: string, value: Knex.DbColumn<T[keyof T]>): this;
    where(columnName: string, value: unknown): this;
    where(columnName: string, operator: string, value: unknown): this;

    whereNot(raw: Knex.Raw): this;
    whereNot(callback: QueryCallback<T>): this;
    whereNot(object: Knex.DbRecord<T>): this;
    whereNot(columnName: keyof T & string, value: Knex.DbColumn<T[keyof T]>): this;
    whereNot(columnName: keyof T & string, operator: string, value: Knex.DbColumn<T[keyof T]>): this;
    whereNot(columnName: string, value: unknown): this;
    whereNot(columnName: string, operator: string, value: unknown): this;

    whereNull(columnName: keyof T & string): this;
    whereNull(columnName: string): this;

    whereNotNull(columnName: keyof T & string): this;
    whereNotNull(columnName: string): this;

    whereIn(columnName: keyof T & string, values: readonly Knex.DbColumn<T[keyof T]>[]): this;
    whereIn(columnName: string, values: readonly unknown[]): this;
    whereIn(columnName: keyof T & string, callback: QueryCallback<T>): this;
    whereIn(columnName: string, callback: Knex.QueryCallback): this;
    whereIn(columnName: keyof T & string, query: Knex.QueryBuilder): this;
    whereIn(columnName: string, query: Knex.QueryBuilder): this;

    whereNotIn(columnName: keyof T & string, values: readonly Knex.DbColumn<T[keyof T]>[]): this;
    whereNotIn(columnName: string, values: readonly unknown[]): this;
    whereNotIn(columnName: keyof T & string, callback: QueryCallback<T>): this;
    whereNotIn(columnName: string, callback: Knex.QueryCallback): this;
    whereNotIn(columnName: keyof T & string, query: Knex.QueryBuilder): this;
    whereNotIn(columnName: string, query: Knex.QueryBuilder): this;

    whereExists(callback: QueryCallback<T>): this;
    whereExists(query: Knex.QueryBuilder): this;

    whereNotExists(callback: QueryCallback<T>): this;
    whereNotExists(query: Knex.QueryBuilder): this;

    whereBetween(columnName: keyof T & string, range: readonly [Knex.DbColumn<T[keyof T]>, Knex.DbColumn<T[keyof T]>]): this;
    whereBetween(columnName: string, range: readonly [unknown, unknown]): this;

    whereNotBetween(columnName: keyof T & string, range: readonly [Knex.DbColumn<T[keyof T]>, Knex.DbColumn<T[keyof T]>]): this;
    whereNotBetween(columnName: string, range: readonly [unknown, unknown]): this;

    whereRaw(sql: string, bindings?: Knex.RawBinding | Knex.ValueDict): this;
    whereRaw(raw: Knex.Raw): this;

    whereLike(columnName: keyof T & string, value: string): this;
    whereLike(columnName: string, value: string): this;

    whereILike(columnName: keyof T & string, value: string): this;
    whereILike(columnName: string, value: string): this;

    whereJsonObject(columnName: keyof T & string, value: object): this;
    whereJsonPath(columnName: keyof T & string, jsonPath: string, operator: string, value: unknown): this;
    whereJsonSupersetOf(columnName: keyof T & string, value: object): this;
    whereJsonSubsetOf(columnName: keyof T & string, value: object): this;

    // ----------------------------------------------------------
    // AND WHERE
    // ----------------------------------------------------------
    andWhere(raw: Knex.Raw): this;
    andWhere(callback: QueryCallback<T>): this;
    andWhere(object: Knex.DbRecord<T>): this;
    andWhere(columnName: string, value: unknown): this;
    andWhere(columnName: string, operator: string, value: unknown): this;

    andWhereNot(raw: Knex.Raw): this;
    andWhereNot(callback: QueryCallback<T>): this;
    andWhereNot(object: Knex.DbRecord<T>): this;
    andWhereNot(columnName: string, value: unknown): this;
    andWhereNot(columnName: string, operator: string, value: unknown): this;

    andWhereRaw(sql: string, bindings?: Knex.RawBinding | Knex.ValueDict): this;

    // ----------------------------------------------------------
    // OR WHERE
    // ----------------------------------------------------------
    orWhere(raw: Knex.Raw): this;
    orWhere(callback: QueryCallback<T>): this;
    orWhere(object: Knex.DbRecord<T>): this;
    orWhere(columnName: string, value: unknown): this;
    orWhere(columnName: string, operator: string, value: unknown): this;

    orWhereNot(raw: Knex.Raw): this;
    orWhereNot(callback: QueryCallback<T>): this;
    orWhereNot(object: Knex.DbRecord<T>): this;
    orWhereNot(columnName: string, value: unknown): this;
    orWhereNot(columnName: string, operator: string, value: unknown): this;

    orWhereNull(columnName: string): this;
    orWhereNotNull(columnName: string): this;

    orWhereIn(columnName: string, values: readonly unknown[]): this;
    orWhereIn(columnName: string, callback: Knex.QueryCallback): this;
    orWhereIn(columnName: string, query: Knex.QueryBuilder): this;

    orWhereNotIn(columnName: string, values: readonly unknown[]): this;
    orWhereNotIn(columnName: string, callback: Knex.QueryCallback): this;
    orWhereNotIn(columnName: string, query: Knex.QueryBuilder): this;

    orWhereExists(callback: QueryCallback<T>): this;
    orWhereExists(query: Knex.QueryBuilder): this;

    orWhereNotExists(callback: QueryCallback<T>): this;
    orWhereNotExists(query: Knex.QueryBuilder): this;

    orWhereBetween(columnName: string, range: readonly [unknown, unknown]): this;
    orWhereNotBetween(columnName: string, range: readonly [unknown, unknown]): this;

    orWhereRaw(sql: string, bindings?: Knex.RawBinding | Knex.ValueDict): this;
    orWhereLike(columnName: string, value: string): this;
    orWhereILike(columnName: string, value: string): this;

    // ----------------------------------------------------------
    // JOIN
    // ----------------------------------------------------------
    join(raw: Knex.Raw): this;
    join(tableName: Knex.TableDescriptor | Knex.AliasDict, clause: Knex.JoinCallback): this;
    join(tableName: Knex.TableDescriptor | Knex.AliasDict, columns: Record<string, string | number | boolean | Knex.Raw>): this;
    join(tableName: Knex.TableDescriptor | Knex.AliasDict, raw: Knex.Raw): this;
    join(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, column2: string): this;
    join(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, raw: Knex.Raw): this;
    join(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, operator: string, column2: string): this;

    leftJoin(raw: Knex.Raw): this;
    leftJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, clause: Knex.JoinCallback): this;
    leftJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, columns: Record<string, string | number | boolean | Knex.Raw>): this;
    leftJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, raw: Knex.Raw): this;
    leftJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, column2: string): this;
    leftJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, raw: Knex.Raw): this;
    leftJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, operator: string, column2: string): this;

    rightJoin(raw: Knex.Raw): this;
    rightJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, clause: Knex.JoinCallback): this;
    rightJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, columns: Record<string, string | number | boolean | Knex.Raw>): this;
    rightJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, raw: Knex.Raw): this;
    rightJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, column2: string): this;
    rightJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, raw: Knex.Raw): this;
    rightJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, operator: string, column2: string): this;

    innerJoin(raw: Knex.Raw): this;
    innerJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, clause: Knex.JoinCallback): this;
    innerJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, column2: string): this;
    innerJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, operator: string, column2: string): this;

    leftOuterJoin(raw: Knex.Raw): this;
    leftOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, clause: Knex.JoinCallback): this;
    leftOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, column2: string): this;
    leftOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, operator: string, column2: string): this;

    rightOuterJoin(raw: Knex.Raw): this;
    rightOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, clause: Knex.JoinCallback): this;
    rightOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, column2: string): this;
    rightOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, operator: string, column2: string): this;

    fullOuterJoin(raw: Knex.Raw): this;
    fullOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, clause: Knex.JoinCallback): this;
    fullOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, column2: string): this;
    fullOuterJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, operator: string, column2: string): this;

    crossJoin(raw: Knex.Raw): this;
    crossJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, clause: Knex.JoinCallback): this;
    crossJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, column2: string): this;
    crossJoin(tableName: Knex.TableDescriptor | Knex.AliasDict, column1: string, operator: string, column2: string): this;

    joinRaw(sql: string, bindings?: Knex.RawBinding | Knex.ValueDict): this;
    joinRaw(raw: Knex.Raw): this;

    // ----------------------------------------------------------
    // GROUP BY / HAVING
    // ----------------------------------------------------------
    groupBy(columnName: keyof T & string): this;
    groupBy(...columnNames: readonly string[]): this;
    groupBy(columnNames: readonly string[]): this;
    groupByRaw(sql: string, bindings?: Knex.RawBinding | Knex.ValueDict): this;
    groupByRaw(raw: Knex.Raw): this;

    having(raw: Knex.Raw): this;
    having(columnName: string, value: unknown): this;
    having(columnName: string, operator: string, value: unknown): this;
    having(columnName: Knex.Raw, operator: string, value: unknown): this;
    havingRaw(sql: string, bindings?: Knex.RawBinding | Knex.ValueDict): this;
    havingRaw(raw: Knex.Raw): this;
    havingIn(columnName: string, values: readonly unknown[]): this;
    havingNotBetween(columnName: string, range: readonly [unknown, unknown]): this;
    havingBetween(columnName: string, range: readonly [unknown, unknown]): this;

    orHaving(raw: Knex.Raw): this;
    orHaving(columnName: string, value: unknown): this;
    orHaving(columnName: string, operator: string, value: unknown): this;
    orHavingRaw(sql: string, bindings?: Knex.RawBinding | Knex.ValueDict): this;
    orHavingRaw(raw: Knex.Raw): this;

    // ----------------------------------------------------------
    // ORDER BY
    // ----------------------------------------------------------
    orderBy(columnName: keyof T & string, direction?: 'asc' | 'desc'): this;
    orderBy(columnName: string, direction?: 'asc' | 'desc'): this;
    orderBy(columns: readonly Knex.ColumnDescriptor<T, unknown>[]): this;
    orderByRaw(sql: string, bindings?: Knex.RawBinding | Knex.ValueDict): this;
    orderByRaw(raw: Knex.Raw): this;

    // ----------------------------------------------------------
    // LIMIT / OFFSET
    // ----------------------------------------------------------
    limit(limit: number): this;
    offset(offset: number): this;

    // ----------------------------------------------------------
    // AGGREGATE
    // ----------------------------------------------------------
    count(columnName?: keyof T & string | '*'): this;
    count(columnName: string): this;
    count(aliases: Record<string, keyof T>): this;
    count(aliases: Record<string, string>): this;
    count(aliases: Record<string, Knex.Raw>): this;
    count(raw: Knex.Raw): this;
    countDistinct(columnName?: keyof T & string | '*'): this;
    countDistinct(columnName: string): this;
    countDistinct(raw: Knex.Raw): this;

    min(columnName: keyof T & string): this;
    min(columnName: string): this;
    min(raw: Knex.Raw): this;

    max(columnName: keyof T & string): this;
    max(columnName: string): this;
    max(raw: Knex.Raw): this;

    sum(columnName: keyof T & string): this;
    sum(columnName: string): this;
    sum(raw: Knex.Raw): this;

    sumDistinct(columnName: keyof T & string): this;
    sumDistinct(columnName: string): this;
    sumDistinct(raw: Knex.Raw): this;

    avg(columnName: keyof T & string): this;
    avg(columnName: string): this;
    avg(raw: Knex.Raw): this;

    avgDistinct(columnName: keyof T & string): this;
    avgDistinct(columnName: string): this;
    avgDistinct(raw: Knex.Raw): this;

    // ----------------------------------------------------------
    // UTILITY
    // ----------------------------------------------------------
    // modify(callback: Knex.QueryCallbackWithArgs, ...args: unknown[]): this;
    // timeout(ms: number, options?: { cancel?: boolean }): this;
    // debug(enabled?: boolean): this;
    // comment(value: string): this;
    // hintComment(value: string | string[]): this;
    // queryContext(context: object): this;

    // clearSelect(): this;
    // clearWhere(): this;
    // clearGroup(): this;
    // clearOrder(): this;
    // clearHaving(): this;
    // clearCounters(): this;
    // clear(statement: string): this;

    // toSQL(): Knex.Sql;
    // toQuery(): string;
    // clone(): this;
}