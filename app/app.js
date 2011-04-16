sb = new Ext.Application({

    // this simply instantiates the main viewport control
    launch: function() {
        this.viewport = new this.Viewport();
    },


    // the viewport is a panel with a 'card' layout to allow us to slide between list & details (and also loading at first)
    Viewport: Ext.extend(Ext.Panel, {

        id        : 'viewport',
        layout    : 'card',
        fullscreen: true,


        items: [
            {
                // the loading card
                id: 'loading',
                setStatus: function(text) {
                    // convenience function to update the spinner text
                    this.el.mask(Ext.LoadingSpinner + text, 'x-mask-loading');
                }
            }, {
                // the list card
                id: 'list',
                layout: 'fit',
                dockedItems: [{
                    // list card's toolbar: title gets added in dynamically
                    dock : 'top',
                    xtype: 'toolbar',
                    title: ''
                }],
                items: {
                    // list itself, bound to a store programmatically
                    id: 'datalist',
                    xtype: 'list',
                    store: null,
                    itemTpl: '<img class="photo" src="{photo_url}" width="40" height="40"/>{name}<br/><img src="{rating_img_url_small}"/>&nbsp;<small>{address1}</small>',
                    listeners: {
                        selectionchange: function (selectionModel, records) {
                            // if selection made, slide to detail card
                            if (records[0]) {
                                sb.viewport.setActiveItem(sb.viewport.detail);
                                sb.viewport.detail.update(records[0].data);
                            }
                        }
                    }
                }
            }, {
                // the details card
                id: 'detail',
                xtype: 'tabpanel',
                dockedItems: [{
                    // also has a toolbar
                    dock : 'top',
                    xtype: 'toolbar',
                    title: '',
                    items: [{
                        // containing a back button that slides back to list card
                        text: 'Back',
                        ui: 'back',
                        listeners: {
                            tap: function () {
                                sb.viewport.setActiveItem(
                                    sb.viewport.list,
                                    {type:'slide', direction: 'right'}
                                );
                            }
                        }
                    }]
                }],
                tabBar: {
                    // the detail card contains two tabs: address and map
                    dock: 'top',
                    ui: 'light',
                    layout: { pack: 'center' }
                },
                items: [
                    {
                        // textual detail
                        title: 'Contact',
                        styleHtmlContent: true,
                        cls: 'detail',
                        tpl: [
                            '<img class="photo" src="{photo_url}"/>',
                            '<h2>{name}</h2>',
                            '<div class="info">',
                                '{address1}<br/>',
                                '<img src="{rating_img_url_small}"/>',
                            '</div>',
                            '<div class="phone x-button">',
                                '<a href="tel:{phone}">{phone}</a>',
                            '</div>',
                            '<div class="link x-button">',
                                '<a href="{mobile_url}" target="_blank">Read more</a>',
                            '</div>',
							'<div class="link x-button">',
							  '<a href="#" onclick=\'createContact("{name}","{phone}","{photo_url}")\'>Add To Contacts</a>',
							'</div>'  
                        ]
                    },
                    {
                        // map detail
                        title: 'Map',
                        xtype: 'map',
                        update: function (data) {
                            // get centered on bound data
                            this.map.setCenter(new google.maps.LatLng(data.latitude, data.longitude));
                            this.marker.setPosition(
                                this.map.getCenter()
                            );
                            this.marker.setMap(this.map);
                        },
                        marker: new google.maps.Marker()
                    }
                ],
                update: function(data) {
                    // updating card cascades to update each tab
                    Ext.each(this.items.items, function(item) {
                        item.update(data);
                    });
                    this.getDockedItems()[0].setTitle(data.name);
                }
            }
        ],

        cardSwitchAnimation: 'slide',

        listeners: {
            'afterrender': function () {
                // when the viewport loads, we go through a callback-centric sequence to load up:
                // a) the geolocation from the browser
                // b) the name of the nearest city from Mongolabs
                // c) the local businesses from Yelp

                //some useful references
                this.list = this.getComponent('list');
                this.detail = this.getComponent('detail');
                var loading = this.getComponent('loading'),
                    datalist = this.list.getComponent('datalist');
                    viewport = this;

                // do the geolocation locally
                loading.setStatus("Getting location");
                sb.getLocation(function (geo) {

                    // then use MongoLabs to get the nearest city
                    loading.setStatus("Getting city");
                    sb.getCity(geo, function (city) {
                        sb.viewport.list.getDockedItems()[0].setTitle(city + ' ' + BUSINESS_TYPE);

                        // then use Yelp to get the businesses
                        loading.setStatus("Getting data");
                        sb.getBusinesses(city, function (store) {

                            // then bind data to list and show it
                            datalist.bindStore(store);
                            viewport.setActiveItem(sb.viewport.list);

                        });
                    });
                });
            }
        }

    }),

    // the functions to perform these steps:

    getLocation: function (callback) {
        new Ext.util.GeoLocation({
            autoUpdate: false,
            listeners: {
                locationupdate: callback
            }
        }).updateLocation();
    },

    getCity: function (geo, callback) {

        // create data model for city
        Ext.regModel("City", {
            fields: [
                {name: "name", type: "string"}
            ]
        });

        Ext.Ajax.useDefaultXhrHeader = false; // Mongolab CORS-busting
        Ext.regStore("cities", {
            model: 'City',
            autoLoad: true,
            proxy: {
                // the MongoDB query escaped into URL
                type: 'ajax',
                url: 'https://mongolab.com/api/1/databases/cities/collections/cities?q=' +
                    escape(
                        '{"location":{"$near":{' +
                            '"lat":' + geo.latitude + ',' +
                            '"long":' + geo.longitude +
                        '}}}'
                    ) +
                    '&l=1' +
                    '&apiKey=' + MONGOLAB_KEY
                ,

                reader: {
                    type: 'json'
                }
            },
            listeners: {
                // when the city record loads, fire the callback with it
                'load': function (store, records, success) {
                    callback(records[0].get('name'))
                }
            }

        });

    },


    getBusinesses: function (city, callback) {
        // create data model
        Ext.regModel("Business", {
            fields: [
                {name: "id", type: "int"},
                {name: "name", type: "string"},
                {name: "latitude", type: "string"},
                {name: "longitude", type: "string"},
                {name: "address1", type: "string"},
                {name: "address2", type: "string"},
                {name: "address3", type: "string"},
                {name: "phone", type: "string"},
                {name: "state_code", type: "string"},
                {name: "mobile_url", type: "string"},
                {name: "rating_img_url_small", type: "string"},
                {name: "photo_url", type: "string"},
            ]
        });

        Ext.regStore("businesses", {
            model: 'Business',
            autoLoad: true,
            proxy: {
                // call Yelp to get business data
                type: 'scripttag',
                url: 'http://api.yelp.com/business_review_search' +
                    '?ywsid=' + YELP_KEY +
                    '&term=' + escape(BUSINESS_TYPE) +
                    '&location=' + escape(city)
                ,
                reader: {
                    type: 'json',
                    root: 'businesses'
                }
            },
            listeners: {
                // when the records load, fire the callback
                'load': function (store) {
                    callback(store);
                }
            }
        })
    }

});