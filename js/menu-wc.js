'use strict';

customElements.define('compodoc-menu', class extends HTMLElement {
    constructor() {
        super();
        this.isNormalMode = this.getAttribute('mode') === 'normal';
    }

    connectedCallback() {
        this.render(this.isNormalMode);
    }

    render(isNormalMode) {
        let tp = lithtml.html(`
        <nav>
            <ul class="list">
                <li class="title">
                    <a href="index.html" data-type="index-link">ReDBox Portal - NG2 Apps</a>
                </li>

                <li class="divider"></li>
                ${ isNormalMode ? `<div id="book-search-input" role="search"><input type="text" placeholder="Type to search"></div>` : '' }
                <li class="chapter">
                    <a data-type="chapter-link" href="index.html"><span class="icon ion-ios-home"></span>Getting started</a>
                    <ul class="links">
                        <li class="link">
                            <a href="overview.html" data-type="chapter-link">
                                <span class="icon ion-ios-keypad"></span>Overview
                            </a>
                        </li>
                        <li class="link">
                            <a href="index.html" data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>README
                            </a>
                        </li>
                        <li class="link">
                            <a href="license.html"  data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>LICENSE
                            </a>
                        </li>
                                <li class="link">
                                    <a href="dependencies.html" data-type="chapter-link">
                                        <span class="icon ion-ios-list"></span>Dependencies
                                    </a>
                                </li>
                    </ul>
                </li>
                    <li class="chapter additional">
                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#additional-pages"'
                            : 'data-target="#xs-additional-pages"' }>
                            <span class="icon ion-ios-book"></span>
                            <span>Additional documentation</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="additional-pages"' : 'id="xs-additional-pages"' }>
                                    <li class="link ">
                                        <a href="additional-documentation/installation-guide.html" data-type="entity-link" data-context-id="additional">Installation guide</a>
                                    </li>
                                    <li class="chapter inner">
                                        <a data-type="chapter-link" href="additional-documentation/configuration-guide.html" data-context-id="additional">
                                            <div class="menu-toggler linked" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#additional-page-4eb17d98569380129f72e728c5d196583cde0ff06f065e89db27811e4bf508497b4aebbc523bfcfa62650f2d181639992e517f8aaf72f77e2c091296f1c91694"' : 'data-target="#xs-additional-page-4eb17d98569380129f72e728c5d196583cde0ff06f065e89db27811e4bf508497b4aebbc523bfcfa62650f2d181639992e517f8aaf72f77e2c091296f1c91694"' }>
                                                <span class="link-name">Configuration guide</span>
                                                <span class="icon ion-ios-arrow-down"></span>
                                            </div>
                                        </a>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="additional-page-4eb17d98569380129f72e728c5d196583cde0ff06f065e89db27811e4bf508497b4aebbc523bfcfa62650f2d181639992e517f8aaf72f77e2c091296f1c91694"' : 'id="xs-additional-page-4eb17d98569380129f72e728c5d196583cde0ff06f065e89db27811e4bf508497b4aebbc523bfcfa62650f2d181639992e517f8aaf72f77e2c091296f1c91694"' }>
                                            <li class="link for-chapter2">
                                                <a href="additional-documentation/configuration-guide/configuring-web-forms.html" data-type="entity-link" data-context="sub-entity" data-context-id="additional">Configuring web forms</a>
                                            </li>
                                            <li class="link for-chapter2">
                                                <a href="additional-documentation/configuration-guide/configuring-email-notifications.html" data-type="entity-link" data-context="sub-entity" data-context-id="additional">Configuring email notifications</a>
                                            </li>
                                            <li class="link for-chapter2">
                                                <a href="additional-documentation/configuration-guide/configuring-integration-with-redbox-and-mint.html" data-type="entity-link" data-context="sub-entity" data-context-id="additional">Configuring integration with RedBox and Mint</a>
                                            </li>
                                            <li class="link for-chapter2">
                                                <a href="additional-documentation/configuration-guide/configuring-authentication.html" data-type="entity-link" data-context="sub-entity" data-context-id="additional">Configuring authentication</a>
                                            </li>
                                        </ul>
                                    </li>
                                    <li class="link ">
                                        <a href="additional-documentation/rest-api-documentation.html" data-type="entity-link" data-context-id="additional">REST API documentation</a>
                                    </li>
                        </ul>
                    </li>
                    <li class="chapter modules">
                        <a data-type="chapter-link" href="modules.html">
                            <div class="menu-toggler linked" data-toggle="collapse" ${ isNormalMode ?
                                'data-target="#modules-links"' : 'data-target="#xs-modules-links"' }>
                                <span class="icon ion-ios-archive"></span>
                                <span class="link-name">Modules</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                        </a>
                        <ul class="links collapse " ${ isNormalMode ? 'id="modules-links"' : 'id="xs-modules-links"' }>
                            <li class="link">
                                <a href="modules/DashboardModule.html" data-type="entity-link" >DashboardModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-DashboardModule-7bf6ad09179e006ce9c6903e93620904cccffa6705102a6b28fc465afd85353ea1aa147b029434c906340307da24943eae250747ab06fa0916387ade421d1890"' : 'data-target="#xs-components-links-module-DashboardModule-7bf6ad09179e006ce9c6903e93620904cccffa6705102a6b28fc465afd85353ea1aa147b029434c906340307da24943eae250747ab06fa0916387ade421d1890"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-DashboardModule-7bf6ad09179e006ce9c6903e93620904cccffa6705102a6b28fc465afd85353ea1aa147b029434c906340307da24943eae250747ab06fa0916387ade421d1890"' :
                                            'id="xs-components-links-module-DashboardModule-7bf6ad09179e006ce9c6903e93620904cccffa6705102a6b28fc465afd85353ea1aa147b029434c906340307da24943eae250747ab06fa0916387ade421d1890"' }>
                                            <li class="link">
                                                <a href="components/DashboardComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DashboardComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/SortComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >SortComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/DmpModule.html" data-type="entity-link" >DmpModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-DmpModule-a3c21093ce689a0d84eb271d35f6d1a8b2d07e082028b9008d26292d03538f1ad1d06bb6fc8403a96b0352804fd3441d0b776bf79ad9ef6973345b64615392b6"' : 'data-target="#xs-components-links-module-DmpModule-a3c21093ce689a0d84eb271d35f6d1a8b2d07e082028b9008d26292d03538f1ad1d06bb6fc8403a96b0352804fd3441d0b776bf79ad9ef6973345b64615392b6"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-DmpModule-a3c21093ce689a0d84eb271d35f6d1a8b2d07e082028b9008d26292d03538f1ad1d06bb6fc8403a96b0352804fd3441d0b776bf79ad9ef6973345b64615392b6"' :
                                            'id="xs-components-links-module-DmpModule-a3c21093ce689a0d84eb271d35f6d1a8b2d07e082028b9008d26292d03538f1ad1d06bb6fc8403a96b0352804fd3441d0b776bf79ad9ef6973345b64615392b6"' }>
                                            <li class="link">
                                                <a href="components/DmpFormComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DmpFormComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/ExportModule.html" data-type="entity-link" >ExportModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-ExportModule-12ab1721ba8827cb128513db107eb7f5d9c2b984fe7d0f058427fafcfba4e013b5dc61606dce6af06cb2a8385c41e72a359cb12bd41d7882a622161a9a3d0469"' : 'data-target="#xs-components-links-module-ExportModule-12ab1721ba8827cb128513db107eb7f5d9c2b984fe7d0f058427fafcfba4e013b5dc61606dce6af06cb2a8385c41e72a359cb12bd41d7882a622161a9a3d0469"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-ExportModule-12ab1721ba8827cb128513db107eb7f5d9c2b984fe7d0f058427fafcfba4e013b5dc61606dce6af06cb2a8385c41e72a359cb12bd41d7882a622161a9a3d0469"' :
                                            'id="xs-components-links-module-ExportModule-12ab1721ba8827cb128513db107eb7f5d9c2b984fe7d0f058427fafcfba4e013b5dc61606dce6af06cb2a8385c41e72a359cb12bd41d7882a622161a9a3d0469"' }>
                                            <li class="link">
                                                <a href="components/ExportFormComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ExportFormComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/LocalAuthModule.html" data-type="entity-link" >LocalAuthModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-LocalAuthModule-2fabe5e2d41e486b868a2e763184e16989edcfc1a0f9109a1490f2c3e91f654b22e68c8b6e75a03ffbd4ea0b10b1b0a81b1758e9083fbaad83e9863ac8644d4c"' : 'data-target="#xs-components-links-module-LocalAuthModule-2fabe5e2d41e486b868a2e763184e16989edcfc1a0f9109a1490f2c3e91f654b22e68c8b6e75a03ffbd4ea0b10b1b0a81b1758e9083fbaad83e9863ac8644d4c"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-LocalAuthModule-2fabe5e2d41e486b868a2e763184e16989edcfc1a0f9109a1490f2c3e91f654b22e68c8b6e75a03ffbd4ea0b10b1b0a81b1758e9083fbaad83e9863ac8644d4c"' :
                                            'id="xs-components-links-module-LocalAuthModule-2fabe5e2d41e486b868a2e763184e16989edcfc1a0f9109a1490f2c3e91f654b22e68c8b6e75a03ffbd4ea0b10b1b0a81b1758e9083fbaad83e9863ac8644d4c"' }>
                                            <li class="link">
                                                <a href="components/LocalAuthComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >LocalAuthComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/ManageRolesModule.html" data-type="entity-link" >ManageRolesModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-ManageRolesModule-b0873ae23a7061b6c0d8df216192d85e99c41f9d21f852af0f14c9e4a3410b7374e2c1257821e69a2844d76e34fb31e9866f0f27caa9390787d49af6d3e1d6ac"' : 'data-target="#xs-components-links-module-ManageRolesModule-b0873ae23a7061b6c0d8df216192d85e99c41f9d21f852af0f14c9e4a3410b7374e2c1257821e69a2844d76e34fb31e9866f0f27caa9390787d49af6d3e1d6ac"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-ManageRolesModule-b0873ae23a7061b6c0d8df216192d85e99c41f9d21f852af0f14c9e4a3410b7374e2c1257821e69a2844d76e34fb31e9866f0f27caa9390787d49af6d3e1d6ac"' :
                                            'id="xs-components-links-module-ManageRolesModule-b0873ae23a7061b6c0d8df216192d85e99c41f9d21f852af0f14c9e4a3410b7374e2c1257821e69a2844d76e34fb31e9866f0f27caa9390787d49af6d3e1d6ac"' }>
                                            <li class="link">
                                                <a href="components/ManageRolesComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ManageRolesComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/ManageUsersModule.html" data-type="entity-link" >ManageUsersModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-ManageUsersModule-fd47c10521beffbe8aeaec477e63f15e4429eada1502dc206768235c4486ac362ee7ca5c3494946107ad5f2f8254d6557f5c9d3cc6c4ece51e04dddc8d84a479"' : 'data-target="#xs-components-links-module-ManageUsersModule-fd47c10521beffbe8aeaec477e63f15e4429eada1502dc206768235c4486ac362ee7ca5c3494946107ad5f2f8254d6557f5c9d3cc6c4ece51e04dddc8d84a479"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-ManageUsersModule-fd47c10521beffbe8aeaec477e63f15e4429eada1502dc206768235c4486ac362ee7ca5c3494946107ad5f2f8254d6557f5c9d3cc6c4ece51e04dddc8d84a479"' :
                                            'id="xs-components-links-module-ManageUsersModule-fd47c10521beffbe8aeaec477e63f15e4429eada1502dc206768235c4486ac362ee7ca5c3494946107ad5f2f8254d6557f5c9d3cc6c4ece51e04dddc8d84a479"' }>
                                            <li class="link">
                                                <a href="components/ManageUsersComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ManageUsersComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/RecordSearchModule.html" data-type="entity-link" >RecordSearchModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-RecordSearchModule-1f9ca47ffabafbc4f893a26e7f0aa13065cfdec85e7f369fd0b54cb7c9959e9d7bee422f687b169ccf901469ca888ece6c1638c545c40593bdae4b53b667025b"' : 'data-target="#xs-components-links-module-RecordSearchModule-1f9ca47ffabafbc4f893a26e7f0aa13065cfdec85e7f369fd0b54cb7c9959e9d7bee422f687b169ccf901469ca888ece6c1638c545c40593bdae4b53b667025b"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-RecordSearchModule-1f9ca47ffabafbc4f893a26e7f0aa13065cfdec85e7f369fd0b54cb7c9959e9d7bee422f687b169ccf901469ca888ece6c1638c545c40593bdae4b53b667025b"' :
                                            'id="xs-components-links-module-RecordSearchModule-1f9ca47ffabafbc4f893a26e7f0aa13065cfdec85e7f369fd0b54cb7c9959e9d7bee422f687b169ccf901469ca888ece6c1638c545c40593bdae4b53b667025b"' }>
                                            <li class="link">
                                                <a href="components/RecordSearchComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RecordSearchComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RecordSearchRefinerComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RecordSearchRefinerComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/ReportModule.html" data-type="entity-link" >ReportModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' : 'data-target="#xs-components-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' :
                                            'id="xs-components-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' }>
                                            <li class="link">
                                                <a href="components/ReportComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ReportComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                        'data-target="#injectables-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' : 'data-target="#xs-injectables-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' :
                                        'id="xs-injectables-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' }>
                                        <li class="link">
                                            <a href="injectables/ReportService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ReportService</a>
                                        </li>
                                    </ul>
                                </li>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#pipes-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' : 'data-target="#xs-pipes-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' }>
                                            <span class="icon ion-md-add"></span>
                                            <span>Pipes</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="pipes-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' :
                                            'id="xs-pipes-links-module-ReportModule-65d9758d4dcc152ee4d19fe10894e69601b52085996102b79b7205b61f439296b98010bc0f1091d633d9ecf30612d8b402d11abb4e49980cad72f627d6e57170"' }>
                                            <li class="link">
                                                <a href="pipes/MultivalueFieldPipe.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >MultivalueFieldPipe</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/SharedModule.html" data-type="entity-link" >SharedModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' : 'data-target="#xs-components-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' :
                                            'id="xs-components-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' }>
                                            <li class="link">
                                                <a href="components/ANDSVocabComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ANDSVocabComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/ActionButtonComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ActionButtonComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/AnchorOrButtonComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AnchorOrButtonComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/AsynchComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >AsynchComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/ButtonBarContainerComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ButtonBarContainerComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/CancelButtonComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >CancelButtonComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/ContributorComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ContributorComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/DataLocationComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DataLocationComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/DateTimeComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DateTimeComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/DmpFieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DmpFieldComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/DropdownFieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DropdownFieldComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/EventHandlerComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >EventHandlerComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/GenericGroupComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >GenericGroupComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/HiddenValueComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >HiddenValueComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/HtmlRawComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >HtmlRawComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/LinkValueComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >LinkValueComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/MapComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >MapComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/MarkdownTextAreaComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >MarkdownTextAreaComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/PDFListComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PDFListComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/PageTitleComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PageTitleComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/ParameterRetrieverComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ParameterRetrieverComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/PublishDataLocationRefreshComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PublishDataLocationRefreshComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/PublishDataLocationSelectorComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >PublishDataLocationSelectorComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RecordMetadataRetrieverComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RecordMetadataRetrieverComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RecordPermissionsComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RecordPermissionsComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RelatedFileUploadComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RelatedFileUploadComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RelatedObjectDataComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RelatedObjectDataComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RelatedObjectSelectorComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RelatedObjectSelectorComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RepeatableContributorComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RepeatableContributorComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RepeatableGroupComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RepeatableGroupComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RepeatableTextfieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RepeatableTextfieldComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/RepeatableVocabComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RepeatableVocabComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/SaveButtonComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >SaveButtonComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/SelectionFieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >SelectionFieldComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/SpacerComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >SpacerComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/TabNavButtonComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TabNavButtonComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/TabOrAccordionContainerComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TabOrAccordionContainerComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/TextAreaComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TextAreaComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/TextBlockComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TextBlockComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/TextFieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TextFieldComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/ToggleComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ToggleComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/TreeNodeCheckboxComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TreeNodeCheckboxComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/VocabFieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >VocabFieldComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/WorkflowStepButtonComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >WorkflowStepButtonComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/WorkspaceFieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >WorkspaceFieldComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/WorkspaceSelectorComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >WorkspaceSelectorComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/WorkspaceSelectorFieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >WorkspaceSelectorFieldComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                        'data-target="#injectables-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' : 'data-target="#xs-injectables-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' :
                                        'id="xs-injectables-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' }>
                                        <li class="link">
                                            <a href="injectables/ANDSService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ANDSService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/ConfigService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ConfigService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/DashboardService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DashboardService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/EmailNotificationService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >EmailNotificationService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/FieldControlMetaService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FieldControlMetaService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/FieldControlService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FieldControlService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/RecordsService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RecordsService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/RolesService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RolesService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/TranslationService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TranslationService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/UserSimpleService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >UserSimpleService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/UtilityService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >UtilityService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/VocabFieldLookupService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >VocabFieldLookupService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/WorkspaceTypeService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >WorkspaceTypeService</a>
                                        </li>
                                    </ul>
                                </li>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#pipes-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' : 'data-target="#xs-pipes-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' }>
                                            <span class="icon ion-md-add"></span>
                                            <span>Pipes</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="pipes-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' :
                                            'id="xs-pipes-links-module-SharedModule-2d9239bea7534127b2257d934534feb02a2008891e3017ae74d8304054881159f4cefdfae86ec680b8a672210e857e58781fbb9de5dbfb76688d32fdbe6ec7ee"' }>
                                            <li class="link">
                                                <a href="pipes/StringTemplatePipe.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >StringTemplatePipe</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/TransferOwnerModule.html" data-type="entity-link" >TransferOwnerModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-TransferOwnerModule-851edb835a69f707d1dda5c3dc92316f83d43c04cc789975e56df9ee2b3cafc91ab133a9a107d7eaef3dfe48848ce3a92fce0b62491f954e8106bd1007bc740e"' : 'data-target="#xs-components-links-module-TransferOwnerModule-851edb835a69f707d1dda5c3dc92316f83d43c04cc789975e56df9ee2b3cafc91ab133a9a107d7eaef3dfe48848ce3a92fce0b62491f954e8106bd1007bc740e"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-TransferOwnerModule-851edb835a69f707d1dda5c3dc92316f83d43c04cc789975e56df9ee2b3cafc91ab133a9a107d7eaef3dfe48848ce3a92fce0b62491f954e8106bd1007bc740e"' :
                                            'id="xs-components-links-module-TransferOwnerModule-851edb835a69f707d1dda5c3dc92316f83d43c04cc789975e56df9ee2b3cafc91ab133a9a107d7eaef3dfe48848ce3a92fce0b62491f954e8106bd1007bc740e"' }>
                                            <li class="link">
                                                <a href="components/TransferOwnerComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TransferOwnerComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/UserProfileModule.html" data-type="entity-link" >UserProfileModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-UserProfileModule-eed4c144c600a0093f7510d5da4f38410cce586df429f94a3e6a630a72a34b191021f2a8c9151e71909f8493773d4fdfd9372fb57dcb1e4c9cc3a567e5cdc383"' : 'data-target="#xs-components-links-module-UserProfileModule-eed4c144c600a0093f7510d5da4f38410cce586df429f94a3e6a630a72a34b191021f2a8c9151e71909f8493773d4fdfd9372fb57dcb1e4c9cc3a567e5cdc383"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-UserProfileModule-eed4c144c600a0093f7510d5da4f38410cce586df429f94a3e6a630a72a34b191021f2a8c9151e71909f8493773d4fdfd9372fb57dcb1e4c9cc3a567e5cdc383"' :
                                            'id="xs-components-links-module-UserProfileModule-eed4c144c600a0093f7510d5da4f38410cce586df429f94a3e6a630a72a34b191021f2a8c9151e71909f8493773d4fdfd9372fb57dcb1e4c9cc3a567e5cdc383"' }>
                                            <li class="link">
                                                <a href="components/UserProfileComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >UserProfileComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/WorkspaceListModule.html" data-type="entity-link" >WorkspaceListModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ?
                                            'data-target="#components-links-module-WorkspaceListModule-7ccd063bf5244349212591bbb4c1e704d62ee9ffff62b8ed00e62c878f6ab3a097f2af4e9867244c2b384e7d5cfff1738c41ab9663783161d67959864be01392"' : 'data-target="#xs-components-links-module-WorkspaceListModule-7ccd063bf5244349212591bbb4c1e704d62ee9ffff62b8ed00e62c878f6ab3a097f2af4e9867244c2b384e7d5cfff1738c41ab9663783161d67959864be01392"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-WorkspaceListModule-7ccd063bf5244349212591bbb4c1e704d62ee9ffff62b8ed00e62c878f6ab3a097f2af4e9867244c2b384e7d5cfff1738c41ab9663783161d67959864be01392"' :
                                            'id="xs-components-links-module-WorkspaceListModule-7ccd063bf5244349212591bbb4c1e704d62ee9ffff62b8ed00e62c878f6ab3a097f2af4e9867244c2b384e7d5cfff1738c41ab9663783161d67959864be01392"' }>
                                            <li class="link">
                                                <a href="components/WorkspaceListComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >WorkspaceListComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                </ul>
                </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#classes-links"' :
                            'data-target="#xs-classes-links"' }>
                            <span class="icon ion-ios-paper"></span>
                            <span>Classes</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="classes-links"' : 'id="xs-classes-links"' }>
                            <li class="link">
                                <a href="classes/ActionButton.html" data-type="entity-link" >ActionButton</a>
                            </li>
                            <li class="link">
                                <a href="classes/AnchorOrButton.html" data-type="entity-link" >AnchorOrButton</a>
                            </li>
                            <li class="link">
                                <a href="classes/ANDSVocabField.html" data-type="entity-link" >ANDSVocabField</a>
                            </li>
                            <li class="link">
                                <a href="classes/AngularPage.html" data-type="entity-link" >AngularPage</a>
                            </li>
                            <li class="link">
                                <a href="classes/AsynchField.html" data-type="entity-link" >AsynchField</a>
                            </li>
                            <li class="link">
                                <a href="classes/BaseService.html" data-type="entity-link" >BaseService</a>
                            </li>
                            <li class="link">
                                <a href="classes/ButtonBarContainer.html" data-type="entity-link" >ButtonBarContainer</a>
                            </li>
                            <li class="link">
                                <a href="classes/CancelButton.html" data-type="entity-link" >CancelButton</a>
                            </li>
                            <li class="link">
                                <a href="classes/Container.html" data-type="entity-link" >Container</a>
                            </li>
                            <li class="link">
                                <a href="classes/ContributorField.html" data-type="entity-link" >ContributorField</a>
                            </li>
                            <li class="link">
                                <a href="classes/DataLocationField.html" data-type="entity-link" >DataLocationField</a>
                            </li>
                            <li class="link">
                                <a href="classes/DateTime.html" data-type="entity-link" >DateTime</a>
                            </li>
                            <li class="link">
                                <a href="classes/EmbeddableComponent.html" data-type="entity-link" >EmbeddableComponent</a>
                            </li>
                            <li class="link">
                                <a href="classes/EventHandler.html" data-type="entity-link" >EventHandler</a>
                            </li>
                            <li class="link">
                                <a href="classes/ExternalLookupDataService.html" data-type="entity-link" >ExternalLookupDataService</a>
                            </li>
                            <li class="link">
                                <a href="classes/FieldBase.html" data-type="entity-link" >FieldBase</a>
                            </li>
                            <li class="link">
                                <a href="classes/HiddenValue.html" data-type="entity-link" >HiddenValue</a>
                            </li>
                            <li class="link">
                                <a href="classes/HtmlRaw.html" data-type="entity-link" >HtmlRaw</a>
                            </li>
                            <li class="link">
                                <a href="classes/LinkValue.html" data-type="entity-link" >LinkValue</a>
                            </li>
                            <li class="link">
                                <a href="classes/LoadableComponent.html" data-type="entity-link" >LoadableComponent</a>
                            </li>
                            <li class="link">
                                <a href="classes/LoginResult.html" data-type="entity-link" >LoginResult</a>
                            </li>
                            <li class="link">
                                <a href="classes/MapField.html" data-type="entity-link" >MapField</a>
                            </li>
                            <li class="link">
                                <a href="classes/MarkdownTextArea.html" data-type="entity-link" >MarkdownTextArea</a>
                            </li>
                            <li class="link">
                                <a href="classes/MintLookupDataService.html" data-type="entity-link" >MintLookupDataService</a>
                            </li>
                            <li class="link">
                                <a href="classes/MintRelationshipLookup.html" data-type="entity-link" >MintRelationshipLookup</a>
                            </li>
                            <li class="link">
                                <a href="classes/NotInFormField.html" data-type="entity-link" >NotInFormField</a>
                            </li>
                            <li class="link">
                                <a href="classes/PageTitle.html" data-type="entity-link" >PageTitle</a>
                            </li>
                            <li class="link">
                                <a href="classes/ParameterRetrieverField.html" data-type="entity-link" >ParameterRetrieverField</a>
                            </li>
                            <li class="link">
                                <a href="classes/PDFListField.html" data-type="entity-link" >PDFListField</a>
                            </li>
                            <li class="link">
                                <a href="classes/Plan.html" data-type="entity-link" >Plan</a>
                            </li>
                            <li class="link">
                                <a href="classes/PlanTable.html" data-type="entity-link" >PlanTable</a>
                            </li>
                            <li class="link">
                                <a href="classes/PublishDataLocationRefreshField.html" data-type="entity-link" >PublishDataLocationRefreshField</a>
                            </li>
                            <li class="link">
                                <a href="classes/PublishDataLocationSelectorField.html" data-type="entity-link" >PublishDataLocationSelectorField</a>
                            </li>
                            <li class="link">
                                <a href="classes/RbValidator.html" data-type="entity-link" >RbValidator</a>
                            </li>
                            <li class="link">
                                <a href="classes/RecordActionResult.html" data-type="entity-link" >RecordActionResult</a>
                            </li>
                            <li class="link">
                                <a href="classes/RecordMetadataRetrieverField.html" data-type="entity-link" >RecordMetadataRetrieverField</a>
                            </li>
                            <li class="link">
                                <a href="classes/RecordPermissionsField.html" data-type="entity-link" >RecordPermissionsField</a>
                            </li>
                            <li class="link">
                                <a href="classes/RecordResponseTable.html" data-type="entity-link" >RecordResponseTable</a>
                            </li>
                            <li class="link">
                                <a href="classes/RecordSearchParams.html" data-type="entity-link" >RecordSearchParams</a>
                            </li>
                            <li class="link">
                                <a href="classes/RecordSearchRefiner.html" data-type="entity-link" >RecordSearchRefiner</a>
                            </li>
                            <li class="link">
                                <a href="classes/RelatedFileUploadField.html" data-type="entity-link" >RelatedFileUploadField</a>
                            </li>
                            <li class="link">
                                <a href="classes/RelatedObjectDataField.html" data-type="entity-link" >RelatedObjectDataField</a>
                            </li>
                            <li class="link">
                                <a href="classes/RelatedObjectSelectorField.html" data-type="entity-link" >RelatedObjectSelectorField</a>
                            </li>
                            <li class="link">
                                <a href="classes/RepeatableComponent.html" data-type="entity-link" >RepeatableComponent</a>
                            </li>
                            <li class="link">
                                <a href="classes/RepeatableContainer.html" data-type="entity-link" >RepeatableContainer</a>
                            </li>
                            <li class="link">
                                <a href="classes/RepeatableContributor.html" data-type="entity-link" >RepeatableContributor</a>
                            </li>
                            <li class="link">
                                <a href="classes/RepeatableVocab.html" data-type="entity-link" >RepeatableVocab</a>
                            </li>
                            <li class="link">
                                <a href="classes/Report.html" data-type="entity-link" >Report</a>
                            </li>
                            <li class="link">
                                <a href="classes/ReportResults.html" data-type="entity-link" >ReportResults</a>
                            </li>
                            <li class="link">
                                <a href="classes/Role.html" data-type="entity-link" >Role</a>
                            </li>
                            <li class="link">
                                <a href="classes/SaveButton.html" data-type="entity-link" >SaveButton</a>
                            </li>
                            <li class="link">
                                <a href="classes/SaveResult.html" data-type="entity-link" >SaveResult</a>
                            </li>
                            <li class="link">
                                <a href="classes/SelectionComponent.html" data-type="entity-link" >SelectionComponent</a>
                            </li>
                            <li class="link">
                                <a href="classes/SelectionField.html" data-type="entity-link" >SelectionField</a>
                            </li>
                            <li class="link">
                                <a href="classes/SimpleComponent.html" data-type="entity-link" >SimpleComponent</a>
                            </li>
                            <li class="link">
                                <a href="classes/Spacer.html" data-type="entity-link" >Spacer</a>
                            </li>
                            <li class="link">
                                <a href="classes/TabNavButton.html" data-type="entity-link" >TabNavButton</a>
                            </li>
                            <li class="link">
                                <a href="classes/TabOrAccordionContainer.html" data-type="entity-link" >TabOrAccordionContainer</a>
                            </li>
                            <li class="link">
                                <a href="classes/TextArea.html" data-type="entity-link" >TextArea</a>
                            </li>
                            <li class="link">
                                <a href="classes/TextField.html" data-type="entity-link" >TextField</a>
                            </li>
                            <li class="link">
                                <a href="classes/Toggle.html" data-type="entity-link" >Toggle</a>
                            </li>
                            <li class="link">
                                <a href="classes/User.html" data-type="entity-link" >User</a>
                            </li>
                            <li class="link">
                                <a href="classes/VocabField.html" data-type="entity-link" >VocabField</a>
                            </li>
                            <li class="link">
                                <a href="classes/WorkflowStepButton.html" data-type="entity-link" >WorkflowStepButton</a>
                            </li>
                            <li class="link">
                                <a href="classes/WorkspaceSelectorField.html" data-type="entity-link" >WorkspaceSelectorField</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#injectables-links"' :
                                'data-target="#xs-injectables-links"' }>
                                <span class="icon ion-md-arrow-round-down"></span>
                                <span>Injectables</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="injectables-links"' : 'id="xs-injectables-links"' }>
                                <li class="link">
                                    <a href="injectables/ReportService.html" data-type="entity-link" >ReportService</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#interfaces-links"' :
                            'data-target="#xs-interfaces-links"' }>
                            <span class="icon ion-md-information-circle-outline"></span>
                            <span>Interfaces</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? ' id="interfaces-links"' : 'id="xs-interfaces-links"' }>
                            <li class="link">
                                <a href="interfaces/UserForm.html" data-type="entity-link" >UserForm</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/UserForm-1.html" data-type="entity-link" >UserForm</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-toggle="collapse" ${ isNormalMode ? 'data-target="#miscellaneous-links"'
                            : 'data-target="#xs-miscellaneous-links"' }>
                            <span class="icon ion-ios-cube"></span>
                            <span>Miscellaneous</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="miscellaneous-links"' : 'id="xs-miscellaneous-links"' }>
                            <li class="link">
                                <a href="miscellaneous/functions.html" data-type="entity-link">Functions</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/variables.html" data-type="entity-link">Variables</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <a data-type="chapter-link" href="coverage.html"><span class="icon ion-ios-stats"></span>Documentation coverage</a>
                    </li>
                    <li class="divider"></li>
                    <li class="copyright">
                        Documentation generated using <a href="https://compodoc.app/" target="_blank">
                            <img data-src="images/compodoc-vectorise-inverted.png" class="img-responsive" data-type="compodoc-logo">
                        </a>
                    </li>
            </ul>
        </nav>
        `);
        this.innerHTML = tp.strings;
    }
});