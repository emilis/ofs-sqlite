/*
    Copyright 2011 Emilis Dambauskas

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/*  
    ObjectFS storage wrapper for Sqlite.
 */

// Requirements:
var ioHandler = require("objectfs-core/ioHandler");
var ringo_strings = require("ringo/utils/strings");

/**
 *
 */
exports.DB = false;


/**
 *
 */
exports.TABLENAME = false;


/**
 *
 */
exports.connect = function(uri) {

    this.DB = require("ctlr-sqlite");
    this.DB.connect(ioHandler.getFileName(uri));
    this.TABLENAME = uri.fragment || "sqlite_master";
};


/**
 * Checks if a record exists in a database.
 *
 * @param {Numer|String|Object} filter ID or filter.
 * @returns {Boolean}
 */
exports.exists = function(filter) {

    if ((typeof(filter) != "object") || (filter instanceof String) || (filter instanceof Number)) {
        filter = { id: filter };
    }
    var options = { fields: ["id"], limit: 1 };
    var result = this.list(filter, options);
    return !!(result && result.length);
};


/**
 *
 */
exports.read = function(id) {

    if ((typeof(id) == "object") && !(id instanceof String)) {
        return this.list(id, { limit: 1 })[0];
    }

    var sql = "select * from `" + this.TABLENAME + "` where id=?";
    var rs = this.DB.prepared_query(sql, [id]);
    var result = this.DB.get_row(rs);
    rs.getStatement().close();
    return result;
};


/**
 *
 */
exports.write = function(id, data) {

    if (!id || !this.exists(id)) {
        return this.create(id, data);
    } else {
        return this.update(id, data);
    }
};


/**
 *
 */
exports.create = function(id, data) {

    if (id && !data.id)
        data.id = id;

    var fields = [];
    var values = [];
    for (var key in data) {
        fields.push(key);
        values.push(data[key]);
    }


    var sql = "INSERT INTO `"
        + this.TABLENAME
        + "` (`" + fields.join("`,`") + "`) "
        + " VALUES(" + ringo_strings.repeat("?,", (values.length - 1)) + "?)";

    var rs = this.DB.prepared_query(sql, values);
    if (rs.getStatement)
        rs.getStatement().close();
    return rs;
};


/**
 *
 */
exports.update = function(id, data) {

    var fields = [];
    var values = [];
    for (var key in data) {
        fields.push(key);
        values.push(data[key]);
    }

    values.push(id);
    var sql = "UPDATE `" + this.TABLENAME + "` SET `" + fields.join('`=?, `') + "`=? WHERE id=?";

    var rs = this.DB.prepared_query(sql, values);
    if (rs.getStatement)
        rs.getStatement().close();
    return rs;
};


/**
 *
 */
exports.remove = function(id) {

    if ((typeof(id) != "object") || (id instanceof String) || (id instanceof Array)) {
        id = {id: id};
    }
    
    var sql = "delete from `" + this.TABLENAME + "` ";
    var {where, values} = where_sql(id);
    sql += where;

    var rs = this.DB.prepared_query(sql, values);
    if (rs.getStatement)
        rs.getStatement().close();
    return rs;
};


/**
 *
 */
exports.iterate = function(filter, options) {

    var rs = this._select_query(filter, options);
    return this.DB.get_iterator(rs) || [];
};


/**
 *
 */
exports.list = function(filter, options) {

    var rs = this._select_query(filter, options);
    var result = this.DB.get_all(rs) || [];
    rs.getStatement().close();
    return result;
};


/**
 *
 */
exports.count = function(filter, options) {

    filter = filter || {};
    options = options || {};
    var {offset, limit, order, fields} = options;


    var sql = "SELECT count(*)";
    sql += " FROM `" + this.TABLENAME + "` ";

    // get where,order,limit:
    var {where, values} = where_sql(filter, options);
    sql += where;
    
    return this.DB.get_one(sql, values);
};


/**
 *
 */
exports._select_query = function(filter, options) {

    filter = filter || {};
    options = options || {};
    var {offset, limit, order, fields} = options;


    var sql = "SELECT ";

    if (!fields) {
        sql += " * ";
    } else {
        sql += "`" + fields.join("`,`") + "`";
    }
    
    
    sql += " FROM `" + this.TABLENAME + "` ";

    // get where,order,limit:
    var {where, values} = where_sql(filter, options);
    sql += where;
    
    return this.DB.prepared_query(sql, values);
};


// ---------------------------------------------------------------------------


/**
 *
 */
function where_sql(filter, options) {

    filter = filter || {};
    options = options || {};
    var {offset, limit, order, fields} = options;

    var sql = "";

    var values = [];
    if (Object.keys(filter).length) {
        sql += " WHERE ";
                var sep = "";
        for (var field in filter) {

            var value = filter[field];
            if (value instanceof Array) {
                sql += sep + field + " IN ('" + value.map(escape_value).join("','") + "')";
            } else if (value instanceof RegExp) {
                sql += sep + field + " LIKE ?";
                values.push(value.toString().slice(1, -1));
            } else {
                sql += sep + field + "=?";
                values.push(filter[field]);
            }
            
            sep = " AND ";
        }
    }

    if (order) {
        sep = "";
        sql += " ORDER BY ";
        for (var field in order) {
            if (order[field] == 1) {
                sql += sep + "`" + field + "`" + " ASC";
            } else if (order[field] == -1) {
                sql += sep + "`" + field + "`" + " DESC";
            }
            sep = ",";
        }
    }

    if (offset && !limit)
        limit = -1; // OFFSET does not work without limit
    if (limit)
        sql += " LIMIT " + limit;
    if (offset)
        sql += " OFFSET " + offset;

    return {
        where: sql,
        values: values
    };
};


/**
 *
 */
function escape_value(value) {
    if (value.replace) {
        return value.replace(/'/g, "''");
    } else {
        return value.toString().replace(/'/g, "''");
    }
};



