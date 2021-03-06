/* @preserve
 * MIT License
 *
 * Copyright (c) 2017 Florian Krönert
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
*/
(function (AttributePropertyHandler, undefined) {
    "use strict";

    var levels = [{ id: "None", text: "None" },
      { id: "Recommended", text: "Recommended" },
      { id: "ApplicationRequired", text: "Application Required" },
      { id: "SystemRequired", text: "System Required" }];

    function ApplyChanges(attribute, changes) {
        for (var change in changes) {
            if (!changes.hasOwnProperty(change)) {
                continue;
            }

            if (change === "RequiredLevel") {
                // System required can not be changed or set
                if (attribute.RequiredLevel.Value === "SystemRequired" || changes[change] === "SystemRequired") {
                    continue;
                }
            }

            if (attribute[change].ManagedPropertyLogicalName) {
                attribute[change].Value = changes[change];
            } else {
                attribute[change] = changes[change];
            }
        }
    }

    function GetUpdates() {
        var records = XrmPropertyEditor.GetGrid().records;

        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];

            if (record.w2ui && record.w2ui.changes) {
                var attribute = XrmPropertyEditor.GetAttributeById (record.recid);

                var changes = record.w2ui.changes;

                ApplyChanges(attribute, changes);
                updates.push(attribute);
            }
        }

        return updates;
    }

    function FillTable () {
        var grid = XrmPropertyEditor.GetGrid();
        grid.clear();

        var records = [];

        for (var i = 0; i < XrmPropertyEditor.metadata.length; i++) {
            var attribute = XrmPropertyEditor.metadata[i];

            var record = {
               recid: attribute.MetadataId,
               schemaName: attribute.SchemaName,
               RequiredLevel: attribute.RequiredLevel.Value,
               IsAuditEnabled: attribute.IsAuditEnabled.Value,
               IsValidForAdvancedFind: attribute.IsValidForAdvancedFind.Value,
               IsSecured: attribute.IsSecured
            };

            records.push(record);
        }

        grid.add(records);
        grid.unlock();
    }

    function InitializeColumns () {
        var grid = XrmPropertyEditor.GetGrid();

        var columnSize = 100 / 5;

        grid.columns = [
            { field: 'schemaName', caption: 'Schema Name', size: columnSize + '%', sortable: true, resizable: true, frozen: true },
            { field: 'RequiredLevel', caption: 'Required Level', size: columnSize + '%', sortable: true, resizable: true,
                editable: { type: 'select', items: levels, showAll: true },
                  render: function (record, index, col_index) {
                      var html = '';
                      for (var i = 0; i < levels.length; i++) {
                          var level = levels[i]
                          if (level.id == this.getCellValue(index, col_index)) {
                              html = level.text;
                          }
                      }
                      return html;
                  }
            },
            { field: 'IsAuditEnabled', caption: 'Is Audit Enabled', size: columnSize + '%', sortable: true, resizable: true, style: 'text-align: center',
                editable: { type: 'checkbox', style: 'text-align: center' }
            },
            { field: 'IsValidForAdvancedFind', caption: 'Is Valid For Advanced Find', size: columnSize + '%', sortable: true, resizable: true, style: 'text-align: center',
                editable: { type: 'checkbox', style: 'text-align: center' }
            },
            { field: 'IsSecured', caption: 'Is Secured', size: columnSize + '%', sortable: true, resizable: true, style: 'text-align: center',
                editable: { type: 'checkbox', style: 'text-align: center' }
            }
        ];

        grid.refresh();
    }

    AttributePropertyHandler.Load = function() {
        XrmPropertyEditor.RestoreInitialColumns();
        InitializeColumns();
        var entityName = XrmPropertyEditor.GetEntity();
        var entityMetadataId = XrmPropertyEditor.entityMetadata[entityName];

        var request = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/Attributes?$filter=IsCustomizable/Value eq true"
        };

        WebApiClient.Retrieve(request)
            .then(function(response) {
                var attributes = response.value.sort(XrmPropertyEditor.SchemaNameComparer);
                XrmPropertyEditor.metadata = attributes;

                FillTable();
            })
            .catch(XrmPropertyEditor.errorHandler);
    }

    AttributePropertyHandler.Save = function() {
        XrmPropertyEditor.LockGrid("Saving");

        var updates = GetUpdates();

        var requests = [];
        var entityUrl = WebApiClient.GetApiUrl() + "EntityDefinitions(" + XrmPropertyEditor.GetEntityId() + ")/Attributes(";

        for (var i = 0; i < updates.length; i++) {
            var update = updates[i];
            var url = entityUrl + update.MetadataId + ")";

            var request = {
                method: "PUT",
                url: url,
                attribute: update,
                headers: [{key: "MSCRM.MergeLabels", value: "true"}]
            };
            requests.push(request);
        }

        WebApiClient.Promise.resolve(requests)
            .each(function(request) {
                return WebApiClient.SendRequest(request.method, request.url, request.attribute, request.headers);
            })
            .then(function (response){
                XrmPropertyEditor.LockGrid("Publishing");

                return XrmPropertyEditor.Publish();
            })
            .then(function (response) {
                XrmPropertyEditor.LockGrid("Reloading");

                return AttributePropertyHandler.Load();
            })
            .catch(XrmPropertyEditor.errorHandler);
    }
} (window.AttributePropertyHandler = window.AttributePropertyHandler || {}));
