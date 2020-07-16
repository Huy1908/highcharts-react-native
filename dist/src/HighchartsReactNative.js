import React from 'react';
import {
    Text,
    View,
    Dimensions,
    StyleSheet,
    Platform
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Asset, FileSystem } from 'react-native-unimodules';

const win = Dimensions.get('window');
const cdnPath = 'code.highcharts.com/';
const path = FileSystem.documentDirectory + 'dist/highcharts-files/highcharts.js';
let httpProto = 'http://';

export default class HighchartsReactNative extends React.PureComponent {
    static getDerivedStateFromProps(props, state) {
        let width = Dimensions.get('window').width;
        let height =  Dimensions.get('window').height;
        if(!!props.styles) {
            const userStyles = StyleSheet.flatten(props.styles);
            const {width: w, height: h} = userStyles;
            width = w;
            height = h;
        }
        return {
            width: width,
            height: height,
        };
    }

    getHighchartsAssets = async () => {
        await this.setLayout()
        await this.getScript()

        this.setState({
            assetsDownloaded: true
        })
    }

    setLayout = async () => {
        const indexHtml = Asset.fromModule(require('./index.html'))
        await indexHtml.downloadAsync()
        const htmlString = await FileSystem.readAsStringAsync(indexHtml.localUri)
        return await this.setState({
            layoutHTML: htmlString
        })
    }

    getScript = async () => {
        let script = Asset.fromModule(require('./highcharts.hcscript'))

        await script.downloadAsync()
        
        const inline = await FileSystem.readAsStringAsync(script.localUri)
        return await this.setState({
            highchartsInline: inline
        })
    }

    constructor(props) {
        super(props);

        if (props.useSSL) {
            httpProto = 'https://';
        }

        this.getHighchartsAssets()

        // extract width and height from user styles
        const userStyles = StyleSheet.flatten(props.styles);

        this.state = {
            width: userStyles.width || win.width,
            height: userStyles.height || win.height,
            chartOptions: props.options,
            useCDN: props.useCDN || false,
            modules: props.modules && props.modules.toString() || [],
            setOptions: props.setOptions || {},
            renderedOnce: false
        };
        this.webviewRef = null
    }
    componentDidUpdate() {
        this.webviewRef && this.webviewRef.postMessage(this.serialize(this.props.options, true));
    }
    componentDidMount() {
        this.setState({ renderedOnce: true });
    }
    /**
     * Convert JSON to string. When is updated, functions (like events.load) 
     * is not wrapped in quotes.
     */
    serialize(chartOptions, isUpdate) {
        var hcFunctions = {},
            serializedOptions,
            i = 0;

        serializedOptions = JSON.stringify(chartOptions, function (val, key) {
            var fcId = '###HighchartsFunction' + i + '###';

            // set reference to function for the later replacement
            if (typeof key === 'function') {
                hcFunctions[fcId] = key.toString();
                i++;
                return isUpdate ? key.toString() : fcId;
            }

            return key;
        });

        // replace ids with functions.
        if (!isUpdate) {
            Object.keys(hcFunctions).forEach(function (key) {
                serializedOptions = serializedOptions.replace(
                    '"' + key + '"',
                    hcFunctions[key]
                );
            });
        }

        return serializedOptions;
    }
    render() {
        if (this.state.assetsDownloaded) {
            const scriptsPath = this.state.useCDN ? httpProto.concat(cdnPath) : path;
            const setOptions = this.state.setOptions;
            const runFirst = `
                window.data = \"${this.props.data ? this.props.data : null}\";
                var modulesList = ${JSON.stringify(this.state.modules)};

                if (modulesList.length > 0) {
                    modulesList = modulesList.split(',');
                }
                var hcScript = document.createElement('script')
                hcScript.innerHTML = ${this.state.highchartsInline}

                document.body.appendChild(hcScript);

                Highcharts.setOptions('${this.serialize(setOptions)}');

                Highcharts.chart("container", ${this.serialize(this.props.options)});

                    //    function loadScripts(file, callback, redraw, isModule) {

                    //       var xhttp = new XMLHttpRequest();
                    //       xhttp.onreadystatechange = function() {
                    //         if (this.readyState == 4 && this.status == 200) {
                                
                    //             var hcScript = document.createElement('script');
                    //             hcScript.innerHTML = this.responseText;
                    //             document.body.appendChild(hcScript);

                    //             if (callback) {
                    //                 callback.call();
                    //             }

                    //             if (redraw) {
                    //                 Highcharts.setOptions('${this.serialize(setOptions)}');

                    //                 Highcharts.chart("container", ${this.serialize(this.props.options)});
                    //             }
                    //         }
                    //       };

                    //       xhttp.open("GET", '${scriptsPath}' + (isModule ? 'modules/' + file : file) + '.js', true);

                    //        xhttp.send();
                    //     }

                    //     loadScripts('highcharts', null, true);
                `;

            // Create container for the chart
            return (
                <View
                    style={[
                        this.props.styles,
                        { width: this.state.width, height: this.state.height }
                    ]}
                >
                    <WebView
                        ref={ref => {this.webviewRef = ref}}
                        onMessage = {this.props.onMessage ? (event) => this.props.onMessage(event.nativeEvent.data) : () => {}}
                        source = {
                            {
                                html: this.state.layoutHTML
                            }
                        }
                        injectedJavaScript={runFirst}
                        originWhitelist={["*"]}
                        automaticallyAdjustContentInsets={true}
                        allowFileAccess={true}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        useWebKit={true}
                        scrollEnabled={false}
                        mixedContentMode='always'
                        allowFileAccessFromFileURLs={true}
                        startInLoadingState = {this.props.loader}
                        style={this.props.webviewStyles}
                    />
                </View>
            )
        } else {
            return <View></View>
        }
    }
}
